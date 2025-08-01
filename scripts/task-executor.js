// scripts/task-executor.js

/**
 * @class TaskExecutor
 * @description Receives a plan (a queue of tasks) and executes them sequentially.
 */
class TaskExecutor {
    constructor(chatService, uiController) {
        this.chatService = chatService;
        this.uiController = uiController;
        this.tasks = [];
        this.currentTaskIndex = 0;
        this.isRunning = false;
        this.lastSuccessfulPlan = null;
    }

    start(tasks) {
        if (!tasks || tasks.length === 0) {
            console.log('[EXECUTOR] No tasks to execute.');
            return;
        }
        this.tasks = tasks;
        this.currentTaskIndex = 0;
        this.isRunning = true;
        this.lastSuccessfulPlan = null; // Reset last plan when starting a new one
        console.log('[EXECUTOR] Starting execution of', this.tasks.length, 'tasks.');
        this.executeNext();
    }

    stop() {
        this.isRunning = false;
        this.tasks = [];
        this.currentTaskIndex = 0;
        this.uiController.hideTaskStatus();
        console.log('[EXECUTOR] Execution stopped.');
    }

    executeNext() {
        if (!this.isRunning || this.currentTaskIndex >= this.tasks.length) {
            this.uiController.showTaskStatus('✅ 所有任务已完成！', 'success');
            this.lastSuccessfulPlan = this.tasks; // <-- Store the successful plan
            setTimeout(() => this.stop(), 3000);
            return;
        }

        const task = this.tasks[this.currentTaskIndex];
        console.log(`[EXECUTOR] Executing task ${this.currentTaskIndex + 1}/${this.tasks.length}:`, task);
        
        const statusText = this.getTaskStatusText(task);
        this.uiController.showTaskStatus(statusText, 'in-progress');

        // Special handling for ANSWER_USER tasks
        if (task.type === 'ANSWER_USER') {
            this.onSuccess({ status: task.text });
            return;
        }

        chrome.runtime.sendMessage({ agenticAction: task }, (response) => {
            if (chrome.runtime.lastError) {
                this.onFailure(chrome.runtime.lastError.message);
            } else if (response.error) {
                this.onFailure(response.error);
            } else {
                this.onSuccess(response);
            }
        });
    }

    onSuccess(response) {
        console.log('[EXECUTOR] Task successful:', response);
        console.log('[EXECUTOR] Current task index:', this.currentTaskIndex, 'Total tasks:', this.tasks.length);
        this.currentTaskIndex++;
        this.executeNext();
    }

    onFailure(error) {
        console.error('[EXECUTOR] Task failed:', error);
        
        // Try to provide helpful feedback and suggestions
        const errorMessage = this.getHelpfulErrorMessage(error);
        this.uiController.showTaskStatus(`❌ 任务失败: ${errorMessage}`, 'error');
        
        // Log the failed task for debugging
        const failedTask = this.tasks[this.currentTaskIndex];
        console.error('[EXECUTOR] Failed task details:', failedTask);
        
        // Don't call stop() immediately, so the user can see the error.
        this.isRunning = false;
    }

    getHelpfulErrorMessage(error) {
        const errorString = error.toString().toLowerCase();
        
        if (errorString.includes('element') && errorString.includes('not found')) {
            return '未找到指定的页面元素。请确保页面已完全加载，或者尝试更具体的描述。';
        }
        
        if (errorString.includes('network') || errorString.includes('connection')) {
            return '网络连接问题。请检查网络连接或稍后重试。';
        }
        
        if (errorString.includes('timeout')) {
            return '操作超时。页面加载可能较慢，请稍后重试。';
        }
        
        if (errorString.includes('permission') || errorString.includes('access')) {
            return '权限不足。请确保插件有必要的权限。';
        }
        
        return error.toString();
    }

    getTaskStatusText(task) {
        const prefix = `[${this.currentTaskIndex + 1}/${this.tasks.length}]`;
        switch (task.type) {
            case 'NAVIGATE_TO_URL':
                return `${prefix} 正在导航至: ${task.url}`;
            case 'CLICK_ELEMENT':
                return `${prefix} 正在点击: "${task.target}"`;
            case 'TYPE_IN_ELEMENT':
                return `${prefix} 正在输入: "${task.value}"`;
            case 'WAIT_FOR_NAVIGATION':
                return `${prefix} 正在等待页面加载...`;
            case 'SUMMARIZE_PAGE':
                return `${prefix} 正在总结页面...`;
            case 'LIST_LINKS':
                return `${prefix} 正在提取链接...`;
            case 'ANSWER_USER':
                return `${prefix} 正在回复用户...`;
            case 'RELOAD_TAB':
                return `${prefix} 正在重新加载页面...`;
            case 'CREATE_TAB':
                return `${prefix} 正在创建新标签页...`;
            case 'CLOSE_TAB':
                return `${prefix} 正在关闭标签页...`;
            default:
                return `${prefix} 正在执行未知任务...`;
        }
    }
}

if (typeof self !== 'undefined') {
    self.TaskExecutor = TaskExecutor;
}
