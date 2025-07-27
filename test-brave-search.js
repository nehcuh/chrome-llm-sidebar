#!/usr/bin/env node

const fetch = require('node-fetch');

async function testBraveSearch() {
    try {
        console.log('测试brave-search服务器连接...');
        
        const response = await fetch('http://localhost:3001/api/mcp/servers/brave-search/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: "npx",
                args: ["@modelcontextprotocol/server-brave-search"],
                description: "网络搜索工具",
                type: "stdio",
                env: {
                    BRAVE_API_KEY: "your_api_key_here" // 需要真实的API密钥
                }
            })
        });
        
        const result = await response.json();
        console.log('Brave-search连接结果:', result);
        
        if (result.error) {
            console.error('连接失败原因:', result.error);
        }
        
    } catch (error) {
        console.log('连接失败原因:', error.message);
        // Try to get more detailed error information
        if (error.message.includes('had 1 outputs') || error.message.includes('had')) {
            console.log('Error likely contains process output - checking server logs...');
        }
    }
}

testBraveSearch();
