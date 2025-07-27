# Simple AI Copilot

一个简化的Chrome侧边栏AI助手插件，支持OpenAI兼容接口、网络搜索和MCP能力。

## 功能特性

- ✅ **OpenAI兼容接口**: 支持任何兼容OpenAI API的服务
- ✅ **侧边栏聊天**: 便捷的侧边栏界面
- ✅ **用户配置**: 自定义API URL、API Key和Temperature
- ✅ **网络搜索**: 集成DuckDuckGo搜索能力
- ✅ **MCP支持**: 完整的Model Context Protocol支持，可连接各种工具
- 🆕 **JSON配置**: 支持Claude Desktop兼容的JSON配置，一键导入MCP服务器

## 项目结构

```
simple-ai-copilot/
├── manifest.json          # Chrome扩展配置文件
├── popup.html             # 弹出窗口HTML
├── sidebar.html           # 侧边栏HTML
├── background.js          # 后台脚本
├── content.js            # 内容脚本
├── mcp-bridge/           # MCP桥接服务器
│   ├── server.js         # 桥接服务器主文件
│   └── package.json      # 服务器依赖配置
├── styles/               # 样式文件
│   ├── popup.css
│   └── sidebar.css
├── scripts/              # JavaScript文件
│   ├── popup.js
│   ├── sidebar.js
│   ├── search-service.js  # 搜索服务
│   ├── mcp-service.js     # MCP协议支持
│   └── mcp-config-manager.js # JSON配置管理
└── README.md
```

## 安装方法

### Chrome扩展安装
1. 打开Chrome浏览器，进入 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目文件夹

### MCP桥接服务器安装
```bash
# 进入MCP桥接服务器目录
cd mcp-bridge

# 安装依赖
npm install

# 启动服务器
npm start
```

## 使用方法

### 基础聊天
1. 点击扩展图标或使用快捷键打开侧边栏
2. 在设置中配置API URL和API Key
3. 开始与AI助手对话

### MCP工具使用
1. 确保MCP桥接服务器已启动
2. 在设置中测试桥接服务器连接  
3. 启用需要的MCP服务器（filesystem, git, search等）
4. 在对话中使用相关功能，如："读取README.md文件"、"查看git状态"

### 🆕 JSON配置导入
1. 在设置中切换到"JSON配置"标签
2. 粘贴Claude Desktop兼容的配置JSON
3. 点击"验证配置"检查格式
4. 点击"导入配置"一键应用设置

详细的MCP使用指南请参考 [MCP_GUIDE.md](./MCP_GUIDE.md)  
JSON配置功能说明请参考 [JSON_CONFIG_GUIDE.md](./JSON_CONFIG_GUIDE.md)

## 配置说明

- **API URL**: OpenAI兼容的API端点（如：`https://api.openai.com/v1`）
- **API Key**: 对应服务的API密钥
- **Temperature**: 控制AI回复的创造性（0-2）
- **Model**: 使用的模型名称（如：`gpt-3.5-turbo`）
- **桥接服务器URL**: MCP桥接服务器地址（默认：`http://localhost:3001`）

## 开发计划

- [x] 完善网络搜索功能
- [x] 添加MCP协议支持
- [x] 实现文件系统工具
- [x] 实现Git工具
- [ ] 添加WebSocket连接支持
- [ ] 支持更多MCP服务器
- [ ] 添加快捷键支持
- [ ] 优化UI/UX体验

## 技术栈

- Vanilla JavaScript
- Chrome Extensions API v3
- CSS3
- HTML5

## 许可证

MIT License