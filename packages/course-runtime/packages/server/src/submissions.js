// ========================================================
// 学生提交和座位表管理
// ========================================================

const path = require('path');
const fs = require('fs');
const { config, getSubmissionsDir } = require('./config');

function extractSeatsFromLayout(layout) {
    if (!layout) return [];

    if (Array.isArray(layout)) {
        return layout;
    }

    if (Array.isArray(layout?.seats)) {
        return layout.seats;
    }

    if (layout?.classrooms && typeof layout.classrooms === 'object') {
        return Object.values(layout.classrooms).flatMap(c => Array.isArray(c?.seats) ? c.seats : []);
    }

    if (typeof layout === 'object') {
        return Object.values(layout).flatMap(c => Array.isArray(c?.seats) ? c.seats : []);
    }

    return [];
}

function readClassroomLayout() {
    try {
        if (!fs.existsSync(config.classroomLayoutPath)) return null;
        return JSON.parse(fs.readFileSync(config.classroomLayoutPath, 'utf-8'));
    } catch (err) {
        console.warn('[classroom-layout] Failed to read layout:', err.message);
        return null;
    }
}

// 从座位表读取学生信息
function getStudentFromClassroomLayout(clientIp) {
    const layout = readClassroomLayout();
    const seats = extractSeatsFromLayout(layout);
    const student = seats.find(s => s && s.ip === clientIp);

    // 查找学生所在的班级
    let classroomName = '';
    if (layout?.classrooms && typeof layout.classrooms === 'object') {
        // 旧格式：layout.classrooms 结构
        for (const [key, classroom] of Object.entries(layout.classrooms)) {
            if (classroom?.seats?.some(s => s && s.ip === clientIp)) {
                classroomName = classroom.name || key;
                break;
            }
        }
    } else if (layout && typeof layout === 'object' && !Array.isArray(layout)) {
        // 新格式：直接是键值对结构（如 classroom-xxx: { name: "xxx", seats: [...] }）
        for (const [key, classroom] of Object.entries(layout)) {
            if (classroom?.seats?.some(s => s && s.ip === clientIp)) {
                classroomName = classroom.name || key;
                break;
            }
        }
    }

    if (student) {
        console.log(`[classroom-layout] Found student for IP ${clientIp}: ${student.name}, classroom: ${classroomName}`);
        return {
            ip: clientIp,
            name: student.name || '',
            studentId: student.studentId || '',
            classroom: classroomName
        };
    }

    console.log(`[classroom-layout] No student found for IP ${clientIp}`);
    return { ip: clientIp, name: '', studentId: '', classroom: '' };
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

    // 获取学生信息
    const studentInfo = getStudentFromClassroomLayout(clientIp);
    const studentName = studentInfo.name || clientIp;
    const studentId = studentInfo.studentId || '';
    const timestamp = new Date().toISOString();

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
            // 在合并模式下，也按班级+日期组织
            const classroomName = studentInfo.classroom || 'default';
            const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const classDateDir = path.join(courseDir, `${classroomName}_${dateStr}`);

            if (!fs.existsSync(classDateDir)) {
                fs.mkdirSync(classDateDir, { recursive: true });
            }

            filePath = path.join(classDateDir, baseFileName);

            // 处理新的问卷格式（包含 header 和 row）
            let header, row;
            if (content && typeof content === 'object' && content.header && content.row) {
                // 新格式：包含表头和数据行
                // 注意：客户端已经生成了带空位的 CSV 行（时间为空,IP为空,姓名为空,学号为空,答案...）
                // 服务器只需要填充前四个字段的学生信息
                header = content.header;

                // 解析 CSV 行（正确处理带引号的字段）
                const parseCSVLine = (line) => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    let i = 0;

                    while (i < line.length) {
                        const char = line[i];

                        if (char === '"') {
                            if (inQuotes && line[i + 1] === '"') {
                                // 双引号转义
                                current += '"';
                                i += 2;
                            } else {
                                // 切换引号状态
                                inQuotes = !inQuotes;
                                i++;
                            }
                        } else if (char === ',' && !inQuotes) {
                            // 字段分隔符
                            result.push(current.trim());
                            current = '';
                            i++;
                        } else {
                            current += char;
                            i++;
                        }
                    }

                    if (current.trim() || result.length > 0) {
                        result.push(current.trim());
                    }

                    return result;
                };

                const rowFields = parseCSVLine(content.row);

                // 填充学生信息：时间,IP,姓名,学号,答案...
                // 确保有足够的字段
                while (rowFields.length < 5) {
                    rowFields.push('');
                }

                rowFields[0] = timestamp;      // 填充时间戳
                rowFields[1] = clientIp;       // 填充IP
                rowFields[2] = studentInfo.name || '';  // 填充姓名
                rowFields[3] = studentInfo.studentId || ''; // 填充学号

                // 重新构建 CSV 行，正确转义每个字段
                const escapeCSVField = (field) => {
                    const str = String(field || '');
                    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                row = rowFields.map(escapeCSVField).join(',') + '\n';

                console.log(`[save-submission] New format with header and row`);
                console.log(`[save-submission] Header: "${header}"`);
                console.log(`[save-submission] Row: "${row.trim()}"`);
            } else {
                // 默认格式：时间,IP,姓名,学号,内容
                header = 'Timestamp,IP,Name,StudentId,Content';

                // 构建数据行，内容需要转义逗号和引号
                const safeContent = typeof content === 'string'
                    ? content.replace(/"/g, '""').replace(/\n/g, '\\n')
                    : JSON.stringify(content);
                row = `${timestamp},${clientIp},${studentInfo.name},${studentInfo.studentId},"${safeContent}"\n`;

                console.log(`[save-submission] Default format with student info`);
                console.log(`[save-submission] Row: "${row}"`);
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
                contentToWrite += header + '\n';
                contentToWrite += row;

                console.log(`[save-submission] Writing new file: "${contentToWrite.substring(0, 200)}..."`);
                fs.writeFileSync(filePath, contentToWrite, 'utf-8');
            } else {
                console.log(`[save-submission] Appending to existing file: "${row.trim()}"`);
                fs.appendFileSync(filePath, row, 'utf-8');
            }
        } else {
            // 分离模式：每个学生一个文件
            // 按班级+日期组织文件，避免不同班级文件混在一起
            const classroomName = studentInfo.classroom || 'default';
            const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const classDateDir = path.join(courseDir, `${classroomName}_${dateStr}`);

            if (!fs.existsSync(classDateDir)) {
                fs.mkdirSync(classDateDir, { recursive: true });
            }

            // 文件名：姓名_学号_IP_文件名，如果没有姓名则用 IP_文件名
            const namePrefix = studentName === clientIp
                ? clientIp.replace(/\./g, '-')
                : `${studentName}_${studentId || ''}_${clientIp.replace(/\./g, '-')}`.replace(/^_+|_+$/g, '');
            const safeFileName = `${namePrefix}_${baseFileName}`.replace(/[<>:"/\\|?*]/g, '_');
            filePath = path.join(classDateDir, safeFileName);
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
