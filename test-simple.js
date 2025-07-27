#!/usr/bin/env node

const fetch = require('node-fetch');

async function testSimpleNode() {
    const config = {
        command: "node",
        args: ["-e", "console.log('Hello from Node'); console.log('Secure MCP Filesystem Server running on stdio'); setTimeout(() => {}, 60000);"],
        description: "简单node测试",
        type: "stdio"
    };

    try {
        console.log('测试简单node命令...');
        console.log('配置:', config);
        
        const response = await fetch('http://localhost:3001/api/mcp/servers/simple-test/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        console.log('连接结果:', result);
        
        if (result.success) {
            console.log('成功！');
        } else {
            console.error('失败:', result.error);
        }
    } catch (error) {
        console.error('请求失败:', error.message);
    }
}

testSimpleNode();