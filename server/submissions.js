// ========================================================
// 学生提交和座位表管理
// ========================================================

const path = require('path');
const fs = require('fs');
const { config, getSubmissionsDir } = require('./config');

// 从座位表读取学生信息
function getStudentFromClassroomLayout(clientIp) {
    try {
        if (fs.existsSync(config.classroomLayoutPath)) {
            const layout = JSON.parse(fs.readFileSync(config.classroomLayoutPath, 'utf-8'));
            // 兼容两种格式：旧格式是数组，新格式是对象 { default: { seats: [] } }
            const seats = Array.isArray(layout) ? layout : (layout['default']?.seats || []);
            const student = seats.find(s => s.ip === clientIp);
            if (student) {
                console.log(`[classroom-layout] Found student for IP ${clientIp}: ${student.name}`);
                return {
                    ip: clientIp,
                    name: student.name || '',
                    studentId: student.studentId || ''
                };
            }
        }
    } catch (err) {
        console.warn('[classroom-layout] Failed to read layout:', err.message);
    }
    console.log(`[classroom-layout] No student found for IP ${clientIp}`);
    return { ip: clientIp, name: '', studentId: '' };
}

// 保存座位表到服务器
function saveClassroomLayout(layout, res) {
    if (!layout || typeof layout !== 'object') {
        return res.json({ success: false, error: 'Invalid layout data' });
    }

    try {
        const dataDir = path.join(__dirname, '..', 'public', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const layoutPath = config.classroomLayoutPath;
        fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');

        console.log(`[classroom-layout] Saved layout to ${layoutPath}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[classroom-layout] Error saving layout:', err);
        res.json({ success: false, error: err.message });
    }
}

// 保存学生提交
function saveSubmission(reqBody, res) {
    const { courseId, clientIp, content, fileName, mergeFile } = reqBody;

    if (!courseId || !clientIp) {
        return res.json({ success: false, error: 'Missing required fields' });
    }

    try {
        const submissionsDir = getSubmissionsDir();
        console.log(`[save-submission] submissionsDir: ${submissionsDir}`);
        const courseDir = path.join(submissionsDir, courseId);
        console.log(`[save-submission] courseDir: ${courseDir}`);

        if (!fs.existsSync(courseDir)) {
            fs.mkdirSync(courseDir, { recursive: true });
        }

        let filePath;
        const baseFileName = fileName || 'submission.txt';
        console.log(`[save-submission] baseFileName: ${baseFileName}`);
        const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

        if (mergeFile) {
            // 合并模式：所有学生提交到一个文件（表格格式）
            filePath = path.join(courseDir, baseFileName);

            // 处理新的问卷格式（包含 header 和 row）
            let header, row;
            if (content && typeof content === 'object' && content.header && content.row) {
                // 新格式：包含表头和数据行
                header = content.header;

                // 获取学生信息并填充到数据行中
                const studentInfo = getStudentFromClassroomLayout(clientIp);
                const rowFields = content.row.split(',');
                // 填充学生信息：时间,IP,姓名,学号,答案...
                rowFields[0] = rowFields[0]; // 保留时间戳
                rowFields[1] = clientIp;    // 填充IP
                rowFields[2] = studentInfo?.name || ''; // 填充姓名
                rowFields[3] = studentInfo?.studentId || ''; // 填充学号
                row = rowFields.join(',') + '\n';

                console.log(`[save-submission] New format with header and row`);
                console.log(`[save-submission] Header: "${header}"`);
                console.log(`[save-submission] Row: "${row}"`);
            } else if (typeof content === 'string' && content.includes(',')) {
                // 旧格式：只有数据行
                row = content + '\n';
                console.log(`[save-submission] Old format, row: "${row}"`);
            } else {
                // 兼容旧格式：转换为 CSV 行
                const timestamp = new Date().toISOString();
                row = `${timestamp},${clientIp},${JSON.stringify(content).replace(/"/g, '""')}\n`;
                console.log(`[save-submission] Legacy format, row: "${row}"`);
            }

            // 检查 row 是否为空
            if (!row || row.trim() === '\n') {
                console.error('[save-submission] Row is empty, skipping');
                return res.json({ success: false, error: 'Content is empty' });
            }

            // 检查文件是否存在，不存在则创建表头
            if (!fs.existsSync(filePath)) {
                // 使用 BOM 头解决 Excel 中文乱码
                let contentToWrite = '\uFEFF';

                // 如果有表头，添加表头
                if (header) {
                    contentToWrite += header + '\n';
                } else {
                    // 没有表头，使用默认表头（旧格式）
                    contentToWrite += 'Timestamp,IP,Content\n';
                }

                // 添加数据行
                contentToWrite += row;

                console.log(`[save-submission] Writing new file: "${contentToWrite.substring(0, 200)}..."`);
                fs.writeFileSync(filePath, contentToWrite, 'utf-8');
            } else {
                console.log(`[save-submission] Appending to existing file: "${row.trim()}"`);
                fs.appendFileSync(filePath, row, 'utf-8');
            }
        } else {
            // 分离模式：每个学生一个文件
            // 获取学生姓名（从机房视图配置中获取）
            let studentName = clientIp;
            try {
                if (fs.existsSync(config.classroomLayoutPath)) {
                    const layout = JSON.parse(fs.readFileSync(config.classroomLayoutPath, 'utf-8'));
                    const studentSeat = Array.isArray(layout) ? layout.find(s => s.ip === clientIp) : null;
                    if (studentSeat && studentSeat.name) {
                        studentName = studentSeat.name;
                    }
                }
            } catch (err) {
                console.warn('[save-submission] Failed to read classroom layout:', err.message);
            }

            // 文件名：学生名称_文件名 或 IP_文件名
            const namePrefix = studentName === clientIp ? clientIp.replace(/\./g, '-') : studentName;
            const safeFileName = `${namePrefix}_${baseFileName}`.replace(/[<>:"/\\|?*]/g, '_');
            filePath = path.join(courseDir, safeFileName);
            fs.writeFileSync(filePath, fileContent, 'utf-8');
        }

        console.log(`[save-submission] Saved: ${filePath} (merge=${mergeFile})`);
        res.json({ success: true, filePath });
    } catch (err) {
        console.error('[save-submission] Error:', err);
        res.json({ success: false, error: err.message });
    }
}

module.exports = {
    getStudentFromClassroomLayout,
    saveClassroomLayout,
    saveSubmission
};
