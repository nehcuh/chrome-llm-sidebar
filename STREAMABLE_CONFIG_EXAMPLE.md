# Streamable HTTP MCP 服务器配置示例

## 你的配置
```json
{
  "mcpServers": {
    "streamable-mcp-server": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

## 完整配置示例（包含描述）
```json
{
  "mcpServers": {
    "streamable-mcp-server": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp",
      "description": "本地流式MCP服务器"
    }
  }
}
```

## 带认证的配置示例
```json
{
  "mcpServers": {
    "streamable-mcp-server": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-API-Key": "your-api-key"
      },
      "description": "需要认证的流式MCP服务器"
    }
  }
}
```

## 使用方法

### 方法1：JSON配置导入
1. 在插件设置中点击"JSON配置"标签
2. 粘贴上面的配置JSON
3. 点击"验证配置"确保格式正确
4. 点击"导入配置"应用设置
5. 返回"可视化配置"标签，启用该服务器

### 方法2：可视化配置添加
1. 在"可视化配置"中点击"添加自定义服务器"
2. 填写：
   - 服务器名称：`streamable-mcp-server`
   - 类型：选择 `streamable-http`
   - URL：`http://127.0.0.1:12306/mcp`
   - 描述：`本地流式MCP服务器`

## 配置字段说明

- **type**: `"streamable-http"` - 指定为HTTP流式类型
- **url**: 服务器的HTTP端点地址
- **headers**: 可选的HTTP请求头，用于认证等
- **description**: 服务器描述

## 故障排除

### 连接失败？
1. 确认服务器在 `http://127.0.0.1:12306/mcp` 运行
2. 检查防火墙设置
3. 确认MCP桥接服务器已启动

### 配置验证失败？
1. 检查JSON格式是否正确
2. 确认URL格式有效
3. 查看验证错误提示