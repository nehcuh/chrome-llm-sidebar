# MCP功能使用指南

## 快速开始

### 1. 启动MCP桥接服务器

```bash
# 进入项目目录
cd simple-ai-copilot/mcp-bridge

# 安装依赖
npm install

# 启动桥接服务器
npm start
```

服务器将在 `http://localhost:3001` 启动。

### 2. 在Chrome扩展中配置

1. 打开扩展侧边栏
2. 点击设置按钮
3. 在"MCP桥接服务器"部分：
   - 确认URL为 `http://localhost:3001`
   - 点击"测试连接"确认服务器可用
4. 在"MCP服务器"部分启用所需服务器

## 可用的MCP服务器

### 1. Filesystem Server
**功能**: 文件系统操作
**安装**: 
```bash
npm install -g @modelcontextprotocol/server-filesystem
```
**配置**: 服务器会使用当前目录 `./` 作为根目录

**示例对话**:
- "读取README.md文件"
- "列出当前目录的文件"
- "查看package.json的内容"

### 2. Git Server  
**功能**: Git版本控制操作
**安装**:
```bash
npm install -g @modelcontextprotocol/server-git
```
**配置**: 服务器会操作当前目录的Git仓库

**示例对话**:
- "查看git状态"
- "显示最近的提交"
- "检查是否有未提交的更改"

### 3. Brave Search Server
**功能**: 网络搜索
**安装**:
```bash
npm install -g @modelcontextprotocol/server-brave-search
```
**配置**: 需要Brave Search API密钥

**示例对话**:
- "搜索最新的AI新闻"
- "查找JavaScript教程"

### 4. SQLite Server
**功能**: SQLite数据库操作
**安装**:
```bash
npm install -g @modelcontextprotocol/server-sqlite
```

## 自定义MCP服务器

你可以添加自己的MCP服务器：

1. 在设置中点击"添加自定义服务器"
2. 填写服务器信息：
   - **名称**: 自定义名称
   - **启动命令**: 如 `node`, `python`, `npx` 等
   - **参数**: 启动参数，用空格分隔
   - **描述**: 服务器功能描述

## 工作原理

```
Chrome扩展 ←→ HTTP桥接服务器 ←→ MCP服务器
```

1. **Chrome扩展**: 发送HTTP请求到桥接服务器
2. **桥接服务器**: 管理MCP服务器进程，转换HTTP请求为JSON-RPC消息
3. **MCP服务器**: 处理具体的工具调用，返回结果

## 故障排除

### 问题1: 桥接服务器连接失败
- 确认桥接服务器已启动
- 检查端口3001是否被占用
- 确认防火墙设置

### 问题2: MCP服务器连接失败
- 确认对应的MCP服务器包已安装
- 检查命令和参数是否正确
- 查看桥接服务器日志

### 问题3: 工具调用失败
- 确认服务器状态为"已连接"
- 检查工具参数是否正确
- 查看开发者工具的错误信息

## 开发自己的MCP服务器

参考官方文档: https://modelcontextprotocol.io/

基本步骤：
1. 实现MCP协议的JSON-RPC接口
2. 定义工具schema
3. 处理工具调用请求
4. 在桥接服务器中注册

## 高级功能

### 自动工具调用
扩展会智能分析用户消息，自动调用相关工具：
- 文件相关: 自动调用filesystem工具
- Git相关: 自动调用git工具  
- 搜索相关: 自动调用search工具

### 工具链组合
可以组合多个工具完成复杂任务：
```
用户: "读取当前目录的所有JS文件并检查git状态"
系统: 调用filesystem.list_directory + git.status
```

## 性能优化

1. **缓存**: 对频繁访问的文件进行缓存
2. **连接池**: 重用MCP服务器连接
3. **批量处理**: 合并相关的工具调用

## 安全注意事项

1. **文件访问**: 默认限制在当前目录
2. **命令执行**: 只允许预定义的MCP服务器
3. **网络访问**: 通过本地桥接服务器进行