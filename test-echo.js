#!/usr/bin/env node

const fetch = require('node-fetch');

async function testEcho() {
    const config = {
        command: "echo",
        args: ["Hello World"],
        description: "Echo测试",
        type: "stdio"
    };

    try {
        console.log('测试echo命令...');
        const response = await fetch('http://localhost:3001/api/mcp/servers/echo-test/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        console.log('Echo测试结果:', result);
    } catch (error) {
        console.error('请求失败:', error.message);
    }
}

testEcho();