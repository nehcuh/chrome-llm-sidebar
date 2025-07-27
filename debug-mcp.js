#!/usr/bin/env node

const { spawn } = require('child_process');

async function debugMCPStart() {
    console.log('开始调试MCP服务器启动...');
    
    const nodePath = 'C:\\Users\\HuChen\\scoop\\apps\\nvm\\current\\nodejs\\nodejs\\node.exe';
    const packagePath = 'C:\\Users\\HuChen\\Projects\\simple-ai-copilot\\node_modules\\@modelcontextprotocol\\server-filesystem\\dist\\index.js';
    const args = [packagePath, './'];
    
    console.log('命令:', nodePath);
    console.log('参数:', args);
    
    const childProcess = spawn(nodePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: 'C:\\Users\\HuChen\\Projects\\simple-ai-copilot'
    });
    
    console.log('进程已启动，PID:', childProcess.pid);
    
    childProcess.stdout.on('data', (data) => {
        console.log('STDOUT:', data.toString());
    });
    
    childProcess.stderr.on('data', (data) => {
        console.error('STDERR:', data.toString());
    });
    
    childProcess.on('error', (error) => {
        console.error('进程错误:', error);
    });
    
    childProcess.on('exit', (code, signal) => {
        console.log('进程退出，代码:', code, '信号:', signal);
    });
    
    // 等待5秒后发送初始化消息
    setTimeout(() => {
        console.log('发送初始化消息...');
        const initMessage = {
            jsonrpc: '2.0',
            id: '1',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'debug-test',
                    version: '1.0.0'
                }
            }
        };
        
        childProcess.stdin.write(JSON.stringify(initMessage) + '\n');
    }, 5000);
    
    // 10秒后终止
    setTimeout(() => {
        console.log('终止进程...');
        childProcess.kill();
    }, 10000);
}

debugMCPStart().catch(console.error);
