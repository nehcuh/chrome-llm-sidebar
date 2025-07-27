#!/usr/bin/env node

const fetch = require('node-fetch');

async function testFileSystemMCP() {
    const config = {
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem", "./"],
        description: "文件系统操作工具",
        type: "stdio"
    };

    try {
        console.log('测试filesystem MCP服务器连接...');
        console.log('配置:', config);
        
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
            console.log('成功！可用工具:', result.tools?.map(t => t.name));
        } else {
            console.error('连接失败:', result.error);
        }
    } catch (error) {
        console.error('请求失败:', error.message);
    }
}

testFileSystemMCP();