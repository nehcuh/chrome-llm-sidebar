#!/usr/bin/env node

// 从Chrome存储读取配置并测试API调用
async function testAPI() {
    console.log('开始测试API配置...');
    
    // 模拟一个简单的API请求来测试
    const testConfigs = [
        {
            name: 'OpenAI GPT-3.5',
            apiUrl: 'https://api.openai.com/v1',
            model: 'gpt-3.5-turbo'
        },
        {
            name: 'OpenAI GPT-4',
            apiUrl: 'https://api.openai.com/v1',
            model: 'gpt-4'
        },
        {
            name: '本地API',
            apiUrl: 'http://localhost:1234/v1',
            model: 'gpt-3.5-turbo'
        }
    ];
    
    console.log('请确保你有有效的API密钥，并且在Chrome扩展中正确配置了以下设置：');
    console.log('1. API URL - 例如: https://api.openai.com/v1');
    console.log('2. API Key - 你的OpenAI API密钥');
    console.log('3. Model - 例如: gpt-3.5-turbo');
    console.log('4. Temperature - 0.7');
    
    console.log('\n常见的400错误原因：');
    console.log('1. API Key无效或格式错误');
    console.log('2. 模型名称不正确（检查是否有拼写错误）');
    console.log('3. API URL不正确');
    console.log('4. 请求体格式不符合API要求');
    console.log('5. 账户余额不足或API访问权限问题');
    
    // 提供一些调试建议
    console.log('\n调试建议：');
    console.log('1. 在Chrome扩展的设置面板中检查所有配置');
    console.log('2. 确认API Key是否以"sk-"开头（OpenAI格式）');
    console.log('3. 尝试使用不同的模型名称（如gpt-3.5-turbo）');
    console.log('4. 检查网络连接和防火墙设置');
    console.log('5. 如果使用第三方API，确认URL和认证方式正确');
}

testAPI();
