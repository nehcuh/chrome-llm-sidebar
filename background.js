chrome.runtime.onInstalled.addListener(() => {
    console.log('Simple AI Copilot installed');
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
        console.error('Failed to open side panel:', error);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'mcpBridgeRequest') {
        handleMCPBridgeRequest(message.url, message.options).then(sendResponse);
        return true; // Indicates that the response is sent asynchronously
    }
    // Handle other potential messages here if needed
});

// 仅保留与真实mcp-bridge通信所需的功能
async function handleMCPBridgeRequest(url, options = {}) {
    console.log(`[BACKGROUND] 代理请求: ${options.method || 'GET'} ${url}`);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || undefined
        });

        const contentType = response.headers.get("content-type");
        let data;
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        console.log(`[BACKGROUND] 桥接请求成功: Status ${response.status}`);

        return {
            success: true,
            data,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        };
    } catch (error) {
        console.error(`[BACKGROUND] 桥接请求失败 for ${url}:`, error);
        return {
            success: false,
            error: error.message,
            ok: false,
            status: 0
        };
    }
}