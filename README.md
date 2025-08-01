# Simple AI Copilot

一个简洁的Chrome侧边栏AI助手插件，支持OpenAI兼容接口和智能页面操作。

## 功能特性

- ✅ **OpenAI兼容接口**: 支持任何兼容OpenAI API的服务
- ✅ **侧边栏聊天**: 便捷的侧边栏界面，支持实时对话
- ✅ **智能配置**: 自定义API URL、API Key、模型和Temperature
- ✅ **智能页面操作**: 自动元素定位和交互
- ✅ **批量操作**: 支持批量处理多个元素
- ✅ **自适应策略**: 智能回退机制处理复杂页面
- 🔧 **MCP支持**: 可选的Model Context Protocol功能（默认关闭）

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

## 使用方法

### 基础功能
1. 点击扩展图标打开侧边栏
2. 在设置中配置API URL和API Key
3. 开始与AI助手对话
4. 使用页面操作功能："帮我点击登录按钮"、"搜索今日新闻"

### MCP功能（可选）
1. 在设置中启用"MCP支持"
2. 按照提示启动桥接服务器
3. 配置需要的MCP服务器
4. 使用高级功能："读取当前目录的文件"

## 配置说明

- **API URL**: OpenAI兼容的API端点（如：`https://api.openai.com/v1`）
- **API Key**: 对应服务的API密钥
- **Temperature**: 控制AI回复的创造性（0-2）
- **Model**: 使用的模型名称（如：`gpt-3.5-turbo`）
- **MCP支持**: 可选的高级功能，默认关闭

## 技术栈

- Vanilla JavaScript
- Chrome Extensions API v3
- CSS3
- HTML5

## 许可证

MIT License