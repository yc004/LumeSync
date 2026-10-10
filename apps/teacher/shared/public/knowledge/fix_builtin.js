const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

// 所有的知识块ID
const ids = [
    'sync-vars-intro',
    'sync-vars-examples',
    'sync-vars-guide',
    'quiz-component',
    'fill-blank-component',
    'drag-sort-component',
    'camera-api',
    'submit-api',
    'canvas-api',
    'animation-basic',
    'tailwind-css',
    'react-hooks',
    'media-images',
    'performance-optimization'
];

let result = content;

// 为每个知识块添加 isBuiltin: true
ids.forEach(id => {
    // 匹配 pattern: },\n    {\n        id: 'xxx'
    const regex = new RegExp(`,\n    \\{\\n        id: '${id}'`, 'g');
    result = result.replace(regex, `,\n        isBuiltin: true\n    {\n        id: '${id}'`);
});

// 最后一个知识块特殊处理（不需要逗号）
result = result.replace(
    /(\s*\})\s*\]/g,
    ',\n        isBuiltin: true\n    \1]'
);

fs.writeFileSync(path.join(__dirname, 'index.js'), result, 'utf8');
console.log('Done! Added isBuiltin: true to all builtin knowledge items.');
