# JSON配置功能使用指南

## 🎉 新功能：JSON配置导入

现在你可以像Claude Desktop一样，直接粘贴JSON配置来快速设置MCP服务器！

## 功能特点

✅ **与Claude Desktop完全兼容** - 可直接复制Claude Desktop的配置  
✅ **智能配置验证** - 自动检查配置格式和常见错误  
✅ **丰富的模板库** - 提供多种预设配置模板  
✅ **一键导入导出** - 轻松备份和分享配置  
✅ **错误提示详细** - 精确定位配置问题  

## 使用方法

### 1. 打开JSON配置面板
1. 进入插件设置
2. 找到"MCP服务器配置"部分
3. 点击"JSON配置"标签

### 2. 使用预设模板
点击"查看配置模板"可以看到：
- **默认模板** - 包含常用的filesystem、git、search、sqlite服务器
- **基础配置** - 适合一般用户的简化配置
- **开发者配置** - 包含更多开发工具
- **数据分析配置** - 专为数据分析场景优化

### 3. 粘贴Claude Desktop配置
如果你已经在Claude Desktop中配置了MCP服务器，可以：
1. 从Claude Desktop复制配置JSON
2. 直接粘贴到文本框中
3. 点击"验证配置"检查格式
4. 点击"导入配置"应用设置

## 配置格式示例

### 基础格式
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "./"],
      "description": "文件系统操作工具"
    },
    "git": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-git", "./"],
      "description": "Git版本控制工具"
    }
  }
}
```

### 包含环境变量的配置
```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-brave-api-key-here"
      },
      "description": "网络搜索工具"
    }
  }
}
```

### 自定义服务器配置
```json
{
  "mcpServers": {
    "my-custom-server": {
      "command": "python",
      "args": ["./my_mcp_server.py"],
      "env": {
        "CUSTOM_CONFIG": "value"
      },
      "description": "我的自定义MCP服务器"
    }
  }
}
```

## 配置字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `command` | string | ✅ | 启动命令（如 "npx", "python", "node"） |
| `args` | array | ✅ | 命令参数数组 |
| `env` | object | ❌ | 环境变量键值对 |
| `description` | string | ❌ | 服务器功能描述 |

## 常见配置模板

### 1. 前端开发者配置
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "./"],
      "description": "项目文件管理"
    },
    "git": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-git", "./"],
      "description": "版本控制"
    },
    "brave-search": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      },
      "description": "技术文档搜索"
    }
  }
}
```

### 2. 数据科学家配置
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "./data"],
      "description": "数据文件访问"
    },
    "sqlite": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-sqlite", "./analysis.db"],
      "description": "分析数据库"
    },
    "python-analysis": {
      "command": "python",
      "args": ["-m", "mcp_analysis_server"],
      "env": {
        "PANDAS_VERSION": "latest"
      },
      "description": "Python数据分析"
    }
  }
}
```

## 配置验证功能

### 自动检查项目
- ✅ JSON格式正确性
- ✅ 必需字段完整性  
- ✅ 字段类型正确性
- ✅ 环境变量格式
- ⚠️ API密钥占位符检测
- ⚠️ 非官方包名提醒

### 错误提示示例
```
❌ 配置验证失败：
• 服务器 "filesystem": 缺少或无效的 "command" 字段
• JSON格式错误: Unexpected token } in JSON at position 156

⚠️ 警告信息：
• 服务器 "brave-search": 请替换占位符API密钥 "BRAVE_API_KEY"
```

## 导入导出功能

### 导入配置
1. 粘贴或输入JSON配置
2. 点击"验证配置"确保格式正确
3. 点击"导入配置"应用设置
4. 系统会替换现有配置并显示导入结果

### 导出配置
1. 点击"导出配置"
2. 配置会自动复制到剪贴板
3. 可以分享给其他用户或备份使用

## 故障排除

### 常见问题

**Q: 导入后服务器无法连接？**  
A: 检查：
- MCP桥接服务器是否运行
- 服务器包是否已安装 (`npm install -g package-name`)
- 命令路径是否正确

**Q: 环境变量不生效？**  
A: 确保：
- 环境变量值为字符串类型
- API密钥已替换占位符
- 重启桥接服务器

**Q: 配置验证失败？**  
A: 检查：
- JSON格式是否正确（建议使用JSON格式化工具）
- 必需字段是否完整
- 数组和对象类型是否正确

### 获取帮助
1. 查看配置模板获取正确格式
2. 使用验证功能定位具体错误
3. 参考错误提示进行修复

## 高级技巧

### 1. 批量配置
可以一次性配置多个服务器，系统会自动处理依赖关系。

### 2. 环境隔离
为不同项目创建不同的配置文件，快速切换开发环境。

### 3. 团队协作
将配置文件保存到项目仓库，团队成员可以快速同步MCP设置。

---

这个新功能让MCP服务器的配置变得更加简单和标准化。现在你可以享受与Claude Desktop相同的配置体验！