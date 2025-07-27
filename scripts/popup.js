class PopupController {
    constructor() {
        this.init();
    }

    async init() {
        await this.setupEventListeners();
        await this.updateConnectionStatus();
    }

    async setupEventListeners() {
        document.getElementById('openSidebar').addEventListener('click', () => {
            this.openSidebar();
        });

        document.getElementById('openSettings').addEventListener('click', () => {
            this.openSettings();
        });
    }

    async openSidebar() {
        try {
            await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
            window.close();
        } catch (error) {
            console.error('Failed to open sidebar:', error);
        }
    }

    async openSettings() {
        try {
            console.log('Opening settings...');
            
            // 首先打开侧边栏
            await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
            console.log('Side panel opened');
            
            // 等待一下让侧边栏加载完成，然后发送消息
            setTimeout(() => {
                console.log('Sending openSettings message...');
                chrome.runtime.sendMessage({ action: 'openSettings' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Runtime error (expected):', chrome.runtime.lastError.message);
                    }
                    console.log('Settings message sent, response:', response);
                });
            }, 100);
            
            console.log('Closing popup...');
            window.close();
        } catch (error) {
            console.error('Failed to open settings:', error);
            alert('无法打开设置面板: ' + error.message);
        }
    }

    async updateConnectionStatus() {
        try {
            const config = await chrome.storage.sync.get(['apiUrl', 'apiKey']);
            const statusIndicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            
            if (config.apiUrl && config.apiKey) {
                statusIndicator.classList.add('connected');
                statusText.textContent = '已配置';
            } else {
                statusIndicator.classList.remove('connected');
                statusText.textContent = '未配置';
            }
        } catch (error) {
            console.error('Failed to update connection status:', error);
        }
    }
}

new PopupController();