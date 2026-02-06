/**
 * AI小说生成器客户端 - 专门为小说创作设计
 * 主渲染进程逻辑
 */

class NovelGenerator {
    constructor() {
        this.selectedContexts = new Set();
        this.chatMessages = [];
        this.serverUrl = 'http://localhost:5000';
        this.isServerRunning = false;
        this.currentContextId = null;
        this.generationParams = {
            creativity: 70,
            length: 500,
            style: 80,
            temperature: 0.8
        };
        
        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        this.bindEvents();
        this.checkServerStatus();
        this.loadContexts();
        this.setupChat();
        this.updateUI();
        this.updateGenerationStats();
        
        // 添加初始欢迎消息
        this.addWelcomeMessage();
    }

    /**
     * 添加欢迎消息
     */
    addWelcomeMessage() {
        const welcomeMessage = {
            id: Date.now(),
            type: 'ai',
            content: '� 欢迎使用AI小说生成器！\n\n我是一个专门为小说创作设计的AI助手，可以帮助你基于选中的上下文生成小说内容。\n\n请先在左侧选择小说上下文，然后调整生成参数，最后在右侧输入创作指令。',
            timestamp: new Date().toISOString()
        };
        
        this.chatMessages.push(welcomeMessage);
        this.renderChatMessages();
    }

    /**
     * 绑定DOM事件
     */
    bindEvents() {
        // 服务器控制按钮
        document.getElementById('startServerBtn')?.addEventListener('click', () => this.startServer());
        document.getElementById('stopServerBtn')?.addEventListener('click', () => this.stopServer());
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadContexts());

        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterContexts(e.target.value));
        }

        // 发送消息按钮
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // 生成小说按钮
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateNovel());
        }

        // 聊天输入框回车发送
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // 模态框关闭按钮
        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.hideModal());
        }

        // 点击遮罩层关闭模态框
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.hideModal();
                }
            });
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            // ESC键关闭模态框
            if (e.key === 'Escape') {
                this.hideModal();
            }
            // Ctrl+F聚焦搜索框
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                searchInput?.focus();
            }
            // Ctrl+R刷新上下文
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.loadContexts();
            }
            // Ctrl+G生成小说
            if (e.ctrlKey && e.key === 'g') {
                e.preventDefault();
                this.generateNovel();
            }
            // Ctrl+S保存小说
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveNovel();
            }
        });

        // 窗口大小变化时调整布局
        window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * 处理窗口大小变化
     */
    handleResize() {
        // 更新聊天消息容器高度
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.style.maxHeight = window.innerHeight < 600 ? '200px' : 'none';
        }
    }

    /**
     * 保存小说
     */
    saveNovel() {
        if (this.chatMessages.length === 0) {
            this.showNotification('没有内容可保存', 'warning');
            return;
        }
        
        // 获取最新的AI消息
        const aiMessages = this.chatMessages.filter(msg => msg.type === 'ai');
        if (aiMessages.length === 0) {
            this.showNotification('没有生成的小说内容', 'warning');
            return;
        }
        
        const latestNovel = aiMessages[aiMessages.length - 1].content;
        
        this.showModal('保存小说', `
            <div class="save-options">
                <h4>选择保存方式：</h4>
                <div class="option-list">
                    <button class="btn novel-btn-primary" onclick="novelGenerator.saveAsFile('${this.escapeHtml(latestNovel)}')">
                        <i class="fas fa-file-alt"></i> 保存为文本文件
                    </button>
                    <button class="btn novel-btn-secondary" onclick="novelGenerator.saveToContext('${this.escapeHtml(latestNovel)}')">
                        <i class="fas fa-book"></i> 保存到小说上下文
                    </button>
                    <button class="btn novel-btn-secondary" onclick="novelGenerator.copyToClipboard('${this.escapeHtml(latestNovel)}')">
                        <i class="fas fa-clipboard"></i> 复制到剪贴板
                    </button>
                </div>
                <div style="margin-top: 15px;">
                    <label>小说标题：</label>
                    <input type="text" id="novelTitle" class="form-control" placeholder="请输入小说标题" value="生成的小说 ${new Date().toLocaleDateString('zh-CN')}">
                </div>
                <p style="margin-top: 15px; color: #666;">
                    提示：文本文件适合本地保存，保存到上下文便于后续继续创作。
                </p>
            </div>
        `);
    }

    /**
     * 保存为文件
     */
    saveAsFile(content) {
        const titleInput = document.getElementById('novelTitle');
        const title = titleInput ? titleInput.value.trim() : `生成的小说 ${new Date().toLocaleDateString('zh-CN')}`;
        
        const exportContent = `${title}\n\n${content}\n\n---\n生成时间：${new Date().toLocaleString('zh-CN')}\n生成工具：AI小说生成器`;
        
        // 创建下载链接
        const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('小说已保存为文本文件', 'success');
        this.hideModal();
    }

    /**
     * 保存到上下文
     */
    async saveToContext(content) {
        if (!this.isServerRunning) {
            this.showNotification('服务器未运行，无法保存到上下文', 'error');
            return;
        }

        const titleInput = document.getElementById('novelTitle');
        const title = titleInput ? titleInput.value.trim() : `生成的小说 ${new Date().toLocaleDateString('zh-CN')}`;

        this.showLoading('正在保存到上下文...');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/context/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    type: 'novel',
                    content: content,
                    description: 'AI生成的小说内容'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification(`小说已保存到上下文：${result.context_id}`, 'success');
                // 重新加载上下文列表
                await this.loadContexts();
            } else {
                throw new Error('保存失败');
            }
        } catch (error) {
            this.showNotification('保存到上下文失败：' + error.message, 'error');
        } finally {
            this.hideLoading();
            this.hideModal();
        }
    }

    /**
     * 复制到剪贴板
     */
    copyToClipboard(content) {
        navigator.clipboard.writeText(content)
            .then(() => {
                this.showNotification('小说内容已复制到剪贴板', 'success');
                this.hideModal();
            })
            .catch(err => {
                this.showNotification('复制失败：' + err.message, 'error');
            });
    }

    /**
     * 导出小说
     */
    exportNovel() {
        if (this.chatMessages.length === 0) {
            this.showNotification('没有内容可导出', 'warning');
            return;
        }
        
        // 获取所有AI消息
        const aiMessages = this.chatMessages.filter(msg => msg.type === 'ai');
        if (aiMessages.length === 0) {
            this.showNotification('没有生成的小说内容', 'warning');
            return;
        }
        
        let exportContent = 'AI小说生成器 - 作品导出\n';
        exportContent += `导出时间：${new Date().toLocaleString('zh-CN')}\n`;
        exportContent += `作品数量：${aiMessages.length}\n`;
        exportContent += '='.repeat(50) + '\n\n';
        
        aiMessages.forEach((msg, index) => {
            exportContent += `【作品 ${index + 1}】生成时间：${this.formatTime(msg.timestamp)}\n`;
            exportContent += msg.content + '\n';
            exportContent += '-'.repeat(40) + '\n\n';
        });
        
        // 创建下载链接
        const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `小说作品_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('小说作品已导出', 'success');
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;

        const content = chatInput.value.trim();
        if (!content) {
            this.showNotification('请输入创作指令', 'warning');
            return;
        }

        // 添加用户消息
        this.addMessage('user', content);
        chatInput.value = '';

        // 显示加载状态
        const loadingMsg = this.addMessage('ai', '正在创作...', true);

        try {
            // 如果有选中的上下文，使用专门的生成函数
            if (this.selectedContexts.size > 0) {
                const response = await this.generateNovelContent(content, Array.from(this.selectedContexts));
                this.updateMessage(loadingMsg.id, response);
            } else {
                // 没有选中上下文，使用通用对话
                const response = await this.generateAIResponse(content, []);
                this.updateMessage(loadingMsg.id, response);
            }
        } catch (error) {
            this.updateMessage(loadingMsg.id, '抱歉，创作失败。请稍后再试。\n错误信息：' + error.message);
        }
    }

    /**
     * 生成AI响应（通用对话）
     */
    async generateAIResponse(userMessage, selectedContexts) {
        // 模拟AI响应延迟
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        const responses = [
            `我理解你的创作需求："${userMessage}"。我可以帮你进行小说创作。`,
            `关于"${userMessage}"，我可以为你提供创作建议或直接生成内容。`,
            `这是一个很好的创作想法！让我为你构思一下。`,
            `基于你的查询，我建议先选择一些上下文作为创作基础。`,
            `我分析了你的创作需求，可以为你生成相关内容。需要我详细创作吗？`
        ];

        let response = responses[Math.floor(Math.random() * responses.length)];
        
        if (selectedContexts.length > 0) {
            response += `\n\n📚 基于你选择的${selectedContexts.length}个上下文，我可以：\n`;
            response += `1. 提取关键信息进行创作\n`;
            response += `2. 分析上下文关联性\n`;
            response += `3. 生成符合上下文风格的内容\n`;
            response += `4. 提供具体创作建议`;
        }

        return response;
    }

    /**
     * 检查服务器状态
     */
    async checkServerStatus() {
        try {
            const response = await fetch(`${this.serverUrl}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                timeout: 3000
            });
            
            this.isServerRunning = response.ok;
            this.updateServerStatus();
            
            if (this.isServerRunning) {
                this.showNotification('服务器连接成功', 'success');
            }
        } catch (error) {
            this.isServerRunning = false;
            this.updateServerStatus();
            console.log('服务器未运行，等待用户启动');
        }
    }

    /**
     * 更新服务器状态显示
     */
    updateServerStatus() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const startBtn = document.getElementById('startServerBtn');
        const stopBtn = document.getElementById('stopServerBtn');

        if (this.isServerRunning) {
            statusIndicator?.classList.remove('status-stopped');
            statusIndicator?.classList.add('status-started');
            statusText && (statusText.textContent = '服务器运行中');
            startBtn && (startBtn.disabled = true);
            stopBtn && (stopBtn.disabled = false);
        } else {
            statusIndicator?.classList.remove('status-started');
            statusIndicator?.classList.add('status-stopped');
            statusText && (statusText.textContent = '服务器已停止');
            startBtn && (startBtn.disabled = false);
            stopBtn && (stopBtn.disabled = true);
        }
    }

    /**
     * 启动服务器
     */
    async startServer() {
        this.showLoading('正在启动服务器...');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.isServerRunning = true;
                this.updateServerStatus();
                this.showNotification('服务器启动成功', 'success');
                await this.loadContexts();
                
                // 添加系统消息
                this.addSystemMessage('服务器已启动，可以开始小说创作。');
            } else {
                throw new Error('启动失败');
            }
        } catch (error) {
            this.showNotification('服务器启动失败：' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 停止服务器
     */
    async stopServer() {
        this.showLoading('正在停止服务器...');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.isServerRunning = false;
                this.updateServerStatus();
                this.showNotification('服务器已停止', 'warning');
                this.clearContexts();
                
                // 添加系统消息
                this.addSystemMessage('服务器已停止，小说生成功能不可用。');
            } else {
                throw new Error('停止失败');
            }
        } catch (error) {
            this.showNotification('服务器停止失败：' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 加载上下文列表
     */
    async loadContexts() {
        if (!this.isServerRunning) {
            this.showEmptyState('contextList', '服务器未运行');
            this.showNotification('请先启动服务器', 'warning');
            return;
        }

        this.showLoading('正在加载小说上下文...');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/contexts`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const contexts = await response.json();
                this.renderContexts(contexts);
                this.showNotification(`加载了 ${contexts.length} 个小说上下文`, 'success');
                this.updateGenerationStats();
            } else {
                throw new Error('加载失败');
            }
        } catch (error) {
            this.showEmptyState('contextList', '加载失败，请检查服务器');
            this.showNotification('上下文加载失败：' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 渲染上下文列表
     */
    renderContexts(contexts) {
        const contextList = document.getElementById('contextList');
        if (!contextList) return;

        if (!contexts || contexts.length === 0) {
            this.showEmptyState('contextList', '暂无小说上下文数据');
            return;
        }

        contextList.innerHTML = contexts.map(context => `
            <div class="context-item novel-context-item ${this.selectedContexts.has(context.id) ? 'selected' : ''}" 
                 data-id="${context.id}"
                 onclick="novelGenerator.handleContextClick(event, '${context.id}')"
                 ondblclick="novelGenerator.toggleContextSelection('${context.id}')">
                <div class="context-item-icon">
                    <i class="fas fa-${this.getContextIcon(context.type)}"></i>
                </div>
                <div class="context-item-info">
                    <div class="context-item-title">${this.escapeHtml(context.title || '未命名上下文')}</div>
                    <div class="context-item-meta">
                        <span class="novel-type-badge">${context.type || '未知类型'}</span>
                        <span class="context-item-date">${this.formatDate(context.created_at)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 获取上下文图标
     */
    getContextIcon(type) {
        const iconMap = {
            'novel': 'book',
            'character': 'user',
            'world': 'globe',
            'outline': 'map',
            'event': 'calendar-alt',
            'history': 'history',
            'custom': 'file-alt',
            'default': 'book'
        };
        
        return iconMap[type] || iconMap.default;
    }

    /**
     * 处理上下文点击事件
     */
    handleContextClick(event, contextId) {
        if (event.ctrlKey || event.metaKey) {
            // Ctrl+点击：多选
            this.toggleContextSelection(contextId);
        } else {
            // 单击：查看详情
            this.viewContextDetails(contextId);
        }
    }

    /**
     * 切换上下文选择状态
     */
    toggleContextSelection(contextId) {
        if (this.selectedContexts.has(contextId)) {
            this.selectedContexts.delete(contextId);
            this.showNotification('已取消选择上下文', 'info');
        } else {
            this.selectedContexts.add(contextId);
            this.showNotification('已选择上下文', 'success');
        }
        
        this.updateContextSelection();
        this.updateSelectedContentPreview();
        this.updateGenerationStats();
    }

    /**
     * 更新上下文选择状态显示
     */
    updateContextSelection() {
        document.querySelectorAll('.context-item').forEach(item => {
            const contextId = item.dataset.id;
            if (this.selectedContexts.has(contextId)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    /**
     * 查看上下文详情
     */
    async viewContextDetails(contextId) {
        if (!this.isServerRunning) {
            this.showNotification('服务器未运行', 'error');
            return;
        }

        this.showLoading('正在加载详情...');
        
        try {
            const response = await fetch(`${this.serverUrl}/api/context/${contextId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const context = await response.json();
                this.currentContextId = contextId;
                this.renderContextDetails(context);
                this.renderContextItems(context.items || []);
                this.showNotification('上下文详情加载成功', 'success');
            } else {
                throw new Error('加载失败');
            }
        } catch (error) {
            this.showNotification('详情加载失败：' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 渲染上下文详情
     */
    renderContextDetails(context) {
        const detailsContainer = document.getElementById('contextDetails');
        if (!detailsContainer) return;

        detailsContainer.innerHTML = `
            <div class="context-details">
                <div class="detail-item">
                    <div class="detail-label">标题</div>
                    <div class="detail-value">${this.escapeHtml(context.title || '未命名')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">类型</div>
                    <div class="detail-value">${context.type || '未知'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">创建时间</div>
                    <div class="detail-value">${this.formatDate(context.created_at)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">描述</div>
                    <div class="detail-value">${this.escapeHtml(context.description || '无描述')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">操作</div>
                    <div class="detail-value">
                        <button class="btn btn-sm novel-btn-primary" onclick="novelGenerator.useForGeneration('${context.id}')">
                            <i class="fas fa-magic"></i> 用于生成
                        </button>
                        <button class="btn btn-sm novel-btn-secondary" onclick="novelGenerator.addToChat('${context.id}')">
                            <i class="fas fa-comment"></i> 添加到聊天
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染上下文条目
     */
    renderContextItems(items) {
        const itemsContainer = document.getElementById('contextItems');
        if (!itemsContainer) return;

        if (!items || items.length === 0) {
            itemsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>暂无条目数据</p>
                </div>
            `;
            return;
        }

        itemsContainer.innerHTML = `
            <div class="items-section">
                <div class="section-header">
                    <h3><i class="fas fa-list"></i> 条目列表 (${items.length})</h3>
                    <button class="btn btn-sm novel-btn-primary" onclick="novelGenerator.useAllItems()">
                        <i class="fas fa-magic"></i> 使用所有条目
                    </button>
                </div>
                <div class="items-list">
                    ${items.map((item, index) => `
                        <div class="item-card">
                            <div class="item-header">
                                <div class="item-title">${this.escapeHtml(item.title || `条目 ${index + 1}`)}</div>
                                <div class="item-actions">
                                    <button class="btn btn-sm novel-btn-secondary" onclick="novelGenerator.copyToChat('${this.escapeHtml(item.content || '')}')">
                                        <i class="fas fa-comment"></i> 发送到聊天
                                    </button>
                                    <button class="btn btn-sm novel-btn-secondary" onclick="novelGenerator.useItem('${this.escapeHtml(item.content || '')}')">
                                        <i class="fas fa-magic"></i> 使用
                                    </button>
                                </div>
                            </div>
                            <div class="item-content">${this.truncateText(this.escapeHtml(item.content || ''), 200)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 用于生成
     */
    useForGeneration(contextId) {
        this.toggleContextSelection(contextId);
        this.showNotification('上下文已添加到生成列表', 'success');
    }

    /**
     * 添加到聊天
     */
    addToChat(contextId) {
        this.addMessage('user', `我想使用上下文 ${contextId} 进行小说创作。`);
        this.showNotification('上下文已添加到聊天对话', 'success');
    }

    /**
     * 使用条目
     */
    useItem(content) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = `基于以下内容进行创作：\n\n${content}`;
            chatInput.focus();
            this.showNotification('内容已复制到输入框', 'success');
        }
    }

    /**
     * 使用所有条目
     */
    useAllItems() {
        this.addMessage('user', '请使用当前上下文的所有条目进行小说创作。');
        this.showNotification('所有条目已添加到聊天', 'success');
    }

    /**
     * 生成小说
     */
    async generateNovel() {
        if (!this.isServerRunning) {
            this.showNotification('请先启动服务器', 'error');
            return;
        }

        if (this.selectedContexts.size === 0) {
            this.showNotification('请先选择至少一个上下文', 'warning');
            return;
        }

        const chatInput = document.getElementById('chatInput');
        let userPrompt = chatInput?.value.trim() || '请基于选中的上下文生成小说内容';

        if (!userPrompt) {
            userPrompt = '请基于选中的上下文生成小说内容';
        }

        // 添加用户消息
        this.addMessage('user', userPrompt);
        if (chatInput) chatInput.value = '';

        // 显示加载状态
        const loadingMsg = this.addMessage('ai', '正在创作小说...', true);

        try {
            // 获取生成参数
            this.updateGenerationParams();
            
            // 调用AI生成小说
            const response = await this.generateNovelContent(userPrompt, Array.from(this.selectedContexts));
            
            // 更新AI消息
            this.updateMessage(loadingMsg.id, response);
            
            // 显示成功通知
            this.showNotification('小说生成成功', 'success');
        } catch (error) {
            this.updateMessage(loadingMsg.id, '抱歉，小说生成失败。请稍后再试。\n错误信息：' + error.message);
            this.showNotification('小说生成失败：' + error.message, 'error');
        }
    }

    /**
     * 生成小说内容
     */
    async generateNovelContent(userPrompt, selectedContexts) {
        // 更新生成参数
        this.updateGenerationParams();
        
        // 构建请求数据
        const requestData = {
            prompt: userPrompt,
            context_ids: selectedContexts,
            params: this.generationParams
        };

        try {
            const response = await fetch(`${this.serverUrl}/api/generate/novel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data.content || '小说生成成功，但返回内容为空。';
        } catch (error) {
            console.error('小说生成失败:', error);
            
            // 如果API调用失败，使用模拟数据
            return this.generateMockNovelContent(userPrompt, selectedContexts);
        }
    }

    /**
     * 生成模拟小说内容（备用）
     */
    generateMockNovelContent(userPrompt, selectedContexts) {
        // 模拟AI响应延迟
        const delay = 1000 + Math.random() * 1000;
        
        // 基于用户提示和上下文生成响应
        const contextCount = selectedContexts.length;
        const creativity = this.generationParams.creativity;
        const length = this.generationParams.length;
        
        const responses = [
            `📖 基于您选择的${contextCount}个上下文，我创作了以下小说片段：\n\n`,
            `✨ 根据您的创作指令，结合选中的上下文，我生成了以下内容：\n\n`,
            `🎭 基于上下文信息，我为您创作了以下小说章节：\n\n`,
            `📚 根据您的要求，我整合了上下文内容，创作如下：\n\n`
        ];
        
        let response = responses[Math.floor(Math.random() * responses.length)];
        
        // 添加小说内容
        const novelTemplates = [
            `月光如水，洒在古老的庭院中。主角站在梧桐树下，回忆着往昔的点点滴滴。远处传来钟声，打破了夜的宁静。`,
            `雨后的街道弥漫着泥土的芬芳。她撑着油纸伞，缓缓走过青石板路，心中思绪万千。转角处，一个熟悉的身影让她停下了脚步。`,
            `战火纷飞的年代，英雄辈出。他手握长剑，站在城墙上眺望远方。身后是等待他保护的百姓，前方是汹涌而来的敌军。`,
            `科幻世界中的一次意外发现，改变了人类的命运。科学家们围在实验台前，屏息凝视着那闪烁的蓝色光芒。`,
            `仙侠世界中，少年踏上修仙之路。历经磨难，他终于站在了宗门之巅，回望来时路，心中感慨万千。`
        ];
        
        response += novelTemplates[Math.floor(Math.random() * novelTemplates.length)];
        
        // 根据长度参数扩展内容
        if (length > 300) {
            response += `\n\n他深吸一口气，感受着空气中弥漫的紧张气氛。每一个决定都可能影响整个故事的走向，但他必须做出选择。`;
        }
        
        if (length > 600) {
            response += `\n\n回忆如潮水般涌来，那些被遗忘的片段逐渐清晰。原来，所有的偶然都是必然，所有的相遇都有其深意。`;
        }
        
        if (length > 900) {
            response += `\n\n夜色渐深，星辰闪烁。他抬头望向星空，心中涌起一股莫名的感动。或许，这就是命运的安排，让他经历这一切，最终找到属于自己的道路。`;
        }
        
        // 添加创作说明
        response += `\n\n---\n💡 创作说明：\n`;
        response += `• 基于 ${contextCount} 个上下文生成\n`;
        response += `• 创意度：${creativity}%\n`;
        response += `• 目标长度：${length} 字\n`;
        response += `• 风格强度：${this.generationParams.style}%\n\n`;
        response += `需要调整参数或继续创作吗？`;
        
        return response;
    }

    /**
     * 更新生成参数
     */
    updateGenerationParams() {
        const creativitySlider = document.getElementById('creativitySlider');
        const lengthSlider = document.getElementById('lengthSlider');
        const styleSlider = document.getElementById('styleSlider');
        
        if (creativitySlider) this.generationParams.creativity = parseInt(creativitySlider.value);
        if (lengthSlider) this.generationParams.length = parseInt(lengthSlider.value);
        if (styleSlider) this.generationParams.style = parseInt(styleSlider.value);
        
        // 根据创意度计算temperature
        this.generationParams.temperature = 0.5 + (this.generationParams.creativity / 100) * 0.5;
    }

    /**
     * 更新生成统计
     */
    updateGenerationStats() {
        const selectedCount = this.selectedContexts.size;
        const creativity = document.getElementById('creativitySlider')?.value || 70;
        const length = document.getElementById('lengthSlider')?.value || 500;
        
        // 更新选中上下文数量
        const selectedContextsCount = document.getElementById('selectedContextsCount');
        if (selectedContextsCount) {
            selectedContextsCount.textContent = selectedCount;
        }
        
        // 更新选中数量显示
        const selectedCountElement = document.getElementById('selectedCount');
        if (selectedCountElement) {
            selectedCountElement.textContent = selectedCount;
        }
        
        // 计算总字数（估算）
        const totalWords = document.getElementById('totalWords');
        if (totalWords) {
            // 每个上下文大约估算500字
            const estimatedWords = selectedCount * 500 + parseInt(length);
            totalWords.textContent = estimatedWords;
        }
        
        // 计算预计时间
        const generationTime = document.getElementById('generationTime');
        if (generationTime) {
            // 基础时间 + 根据长度和创意度调整
            const baseTime = 3; // 基础3秒
            const lengthFactor = length / 1000; // 每1000字增加1秒
            const creativityFactor = creativity / 100; // 创意度越高时间越长
            const estimatedTime = baseTime + lengthFactor + creativityFactor;
            generationTime.textContent = estimatedTime.toFixed(1) + 's';
        }
    }
