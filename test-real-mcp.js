#!/usr/bin/env node

const fetch = require('node-fetch');

async function testRealMCPConnection() {
    const config = {
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem", "./"],
        description: "文件系统操作工具",
        type: "stdio"
    };

    try {
        console.log('发送真实MCP服务器连接请求...');
        const response = await fetch('http://localhost:3001/api/mcp/servers/filesystem/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        console.log('连接结果:', result);
        
        if (result.success) {
            console.log('成功连接到MCP服务器！');
            console.log('可用工具:', result.tools);
        }
    } catch (error) {
        console.error('连接失败:', error);
    }
}

testRealMCPConnection();