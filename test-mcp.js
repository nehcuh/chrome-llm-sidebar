#!/usr/bin/env node

const fetch = require('node-fetch');

async function testMCPConnection() {
    const config = {
        command: "node",
        args: ["-e", "console.log('Server running on stdio'); setTimeout(() => {}, 60000);"],
        description: "测试MCP服务器",
        type: "stdio"
    };

    try {
        console.log('发送连接请求...');
        const response = await fetch('http://localhost:3001/api/mcp/servers/test/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        console.log('连接结果:', result);
        
        if (result.success) {
            // 测试工具调用
            console.log('测试工具调用...');
            const toolResponse = await fetch('http://localhost:3001/api/mcp/tools/test/echo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: 'Hello World' })
            });
            
            const toolResult = await toolResponse.json();
            console.log('工具调用结果:', toolResult);
        }
    } catch (error) {
        console.error('连接失败:', error);
    }
}

testMCPConnection();