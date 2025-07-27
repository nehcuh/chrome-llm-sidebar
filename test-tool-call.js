#!/usr/bin/env node

const fetch = require('node-fetch');

async function testToolCall() {
    try {
        console.log('测试工具调用...');
        
        // 首先连接到文件系统服务器
        console.log('连接文件系统服务器...');
        const connectResponse = await fetch('http://localhost:3001/api/mcp/servers/filesystem/connect', {
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
        
        const connectResult = await connectResponse.json();
        console.log('连接结果:', connectResult.success ? '成功' : '失败');
        
        if (connectResult.success) {
            // 测试列出目录
            console.log('\n测试 list_directory 工具...');
            const listResponse = await fetch('http://localhost:3001/api/mcp/tools/filesystem/list_directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parameters: {
                        path: './'
                    }
                })
            });
            
            const listResult = await listResponse.json();
            console.log('目录列表结果:', listResult);
            
            // 测试读取package.json文件
            console.log('\n测试 read_file 工具...');
            const readResponse = await fetch('http://localhost:3001/api/mcp/tools/filesystem/read_file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parameters: {
                        path: './package.json'
                    }
                })
            });
            
            const readResult = await readResponse.json();
            if (readResult.success) {
                console.log('文件读取成功!');
                console.log('package.json前100个字符:', readResult.result[0].text.substring(0, 100) + '...');
            } else {
                console.log('文件读取失败:', readResult.error);
            }
        }
        
    } catch (error) {
        console.error('测试失败:', error.message);
    }
}

testToolCall();
