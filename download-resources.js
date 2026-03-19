#!/usr/bin/env node
/**
 * 资源预下载工具
 * 在上课前运行此脚本，将所有外部资源下载到本地，确保学生机在断网环境下正常使用
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 资源列表
const resources = [
    // 核心框架资源
    {
        name: 'Tailwind CSS',
        url: 'https://cdn.tailwindcss.com',
        filename: 'tailwindcss.js'
    },
    {
        name: 'FontAwesome CSS',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
        filename: 'fontawesome.all.min.css'
    },
    {
        name: 'FontAwesome WOFF2',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
        filename: 'fa-solid-900.woff2'
    },
    {
        name: 'FontAwesome WOFF2 Regular',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
        filename: 'fa-regular-400.woff2'
    },
    {
        name: 'FontAwesome WOFF2 Brands',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
        filename: 'fa-brands-400.woff2'
    },
    {
        name: 'React',
        url: 'https://unpkg.com/react@18/umd/react.development.js',
        filename: 'react.development.js'
    },
    {
        name: 'ReactDOM',
        url: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
        filename: 'react-dom.development.js'
    },
    {
        name: 'Babel',
        url: 'https://unpkg.com/@babel/standalone/babel.min.js',
        filename: 'babel.min.js'
    }
];

const libDir = path.join(__dirname, 'public', 'lib');

// 确保目录存在
if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
}

// 下载单个资源（支持重定向）
function downloadResource(resource, redirectUrl = null, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(libDir, resource.filename);
        const MAX_REDIRECTS = 5;
        
        if (redirectCount > MAX_REDIRECTS) {
            return reject(new Error('重定向次数过多'));
        }
        
        const url = redirectUrl || resource.url;
        
        if (!redirectUrl) {
            console.log(`📥 下载: ${resource.name}...`);
        }
        
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (response) => {
            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                // 处理相对路径重定向
                if (redirectUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                // 递归处理重定向，不创建文件
                return downloadResource(resource, redirectUrl, redirectCount + 1)
                    .then(resolve).catch(reject);
            }
            
            if (response.statusCode === 200) {
                // 只有在确定不 redirect 后才创建文件
                const fileStream = fs.createWriteStream(filePath);
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    const size = (fs.statSync(filePath).size / 1024).toFixed(1);
                    console.log(`✅ ${resource.name} (${size} KB)`);
                    resolve();
                });
                
                fileStream.on('error', (err) => {
                    fileStream.close();
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    console.error(`❌ ${resource.name} (文件写入错误: ${err.message})`);
                    reject(err);
                });
            } else {
                console.error(`❌ ${resource.name} (HTTP ${response.statusCode})`);
                reject(new Error(`HTTP ${response.statusCode}`));
            }
        }).on('error', (err) => {
            console.error(`❌ ${resource.name} (请求错误: ${err.message})`);
            reject(err);
        });
    });
}

// 主函数
async function main() {
    console.log('========================================');
    console.log('  📦 SyncClassroom 资源预下载工具');
    console.log('========================================');
    console.log('');
    console.log('此工具将在上课前下载所有外部资源到本地');
    console.log('确保学生机在断网环境下也能正常使用');
    console.log('');
    
    let success = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const resource of resources) {
        try {
            const filePath = path.join(libDir, resource.filename);
            if (fs.existsSync(filePath)) {
                skipped++;
                console.log(`⏭️  已存在: ${resource.name}`);
            } else {
                await downloadResource(resource);
                success++;
            }
        } catch (err) {
            failed++;
        }
    }
    
    console.log('');
    console.log('========================================');
    console.log('  📊 下载完成');
    console.log('========================================');
    console.log(`✅ 成功: ${success}`);
    console.log(`⏭️  跳过: ${skipped}`);
    console.log(`❌ 失败: ${failed}`);
    console.log('');
    
    if (failed > 0) {
        console.log('⚠️  部分资源下载失败，请检查网络连接后重试');
        process.exit(1);
    } else {
        console.log('🎉 所有资源已准备就绪！');
        console.log('');
        console.log('现在可以断网运行服务，学生机将使用本地资源');
    }
}

main().catch(console.error);
