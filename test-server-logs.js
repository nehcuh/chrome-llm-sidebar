#!/usr/bin/env node

const fetch = require('node-fetch');

async function testServerLogs() {
    try {
        console.log('发送请求到桥接服务器...');
        
        const response = await fetch('http://localhost:3001/api/health');
        const result = await response.json();
        console.log('健康检查结果:', result);
        
        // 测试一个会触发大量日志的请求
        console.log('发送filesystem连接请求...');
        const fsResponse = await fetch('http://localhost:3001/api/mcp/servers/filesystem/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: "npx",
                args: ["@modelcontextprotocol/server-filesystem", "./"],
                description: "文件系统操作工具",
                type: "stdio"
            })
        });
        
        const fsResult = await fsResponse.json();
        console.log('Filesystem连接结果:', fsResult);
        
    } catch (error) {
        console.error('请求失败:', error.message);
    }
}

testServerLogs();