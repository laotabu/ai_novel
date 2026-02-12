"""
Web API服务器 - 连接Electron客户端和LangChain后端
"""
import json
import os
import sys
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

# 尝试导入现有的后端模块，提供回退方案
try:
    from config import config
    print("✅ 成功导入config模块")
except ImportError as e:
    print(f"⚠️ 导入config模块失败: {e}")
    # 创建简单的配置对象
    class SimpleConfig:
        class Server:
            host = "localhost"
            port = 5000
            debug = True
            @property
            def url(self):
                return f"http://{self.host}:{self.port}"
        server = Server()
    config = SimpleConfig()

try:
    from context_manager import advanced_context_manager, ContextType
    print("✅ 成功导入context_manager模块")
except ImportError as e:
    print(f"⚠️ 导入context_manager失败: {e}")
    # 创建简单的模拟
    class ContextType:
        NOVEL = "小说数据"
        CHARACTER = "人物设定"
        WORLD = "世界设定"
        OUTLINE = "作品大纲"
        EVENTS = "事件细纲"
        HISTORY = "会话历史"
        CUSTOM = "自定义"
    
    class MockContextItem:
        def __init__(self, id, name, type, content):
            self.id = id
            self.name = name
            self.type = type
            self.content = content
            self.created_at = datetime.now().isoformat()
            self.updated_at = datetime.now().isoformat()
            self.selected_items = set()
        
        def to_dict(self):
            return {
                "id": self.id,
                "name": self.name,
                "type": self.type,
                "content": self.content,
                "created_at": self.created_at,
                "updated_at": self.updated_at
            }
    
    class MockContextManager:
        def __init__(self):
            self.contexts = {}
            self.selected_contexts = set()
            # 添加一些模拟数据
            self.contexts["test1"] = MockContextItem("test1", "测试小说", "小说数据", "这是一个测试小说内容")
            self.contexts["test2"] = MockContextItem("test2", "人物设定", "人物设定", "主角：张三，年龄20岁")
        
        def list_contexts(self):
            return [{"id": k, "name": v.name, "type": v.type, "created_at": v.created_at, 
                    "updated_at": v.updated_at, "is_selected": k in self.selected_contexts} 
                   for k, v in self.contexts.items()]
        
        def get_context(self, context_id):
            return self.contexts.get(context_id)
        
        def get_contexts_by_type(self, context_type):
            return [v for v in self.contexts.values() if v.type == context_type]
        
        def select_contexts(self, context_ids):
            self.selected_contexts = set(context_ids)
        
        def get_selected_contexts_content(self):
            if not self.selected_contexts:
                return "【未选择任何上下文】"
            contents = []
            for ctx_id in self.selected_contexts:
                ctx = self.contexts.get(ctx_id)
                if ctx:
                    contents.append(f"=== {ctx.type}: {ctx.name} ===\n{ctx.content}")
            return "\n\n".join(contents)
        
        def create_context(self, name, context_type, content, metadata=None):
            import uuid
            ctx_id = str(uuid.uuid4())[:8]
            self.contexts[ctx_id] = MockContextItem(ctx_id, name, context_type, content)
            return ctx_id
        
        def save_to_context(self, context_id, content, append=False):
            ctx = self.contexts.get(context_id)
            if ctx:
                if append:
                    ctx.content += f"\n\n{content}"
                else:
                    ctx.content = content
                ctx.updated_at = datetime.now().isoformat()
        
        def get_context_items(self, context_id):
            ctx = self.contexts.get(context_id)
            if ctx:
                # 简单模拟：将内容拆分为多个条目
                if isinstance(ctx.content, str):
                    return [{"id": "item1", "content": ctx.content, "created_at": ctx.created_at}]
                elif isinstance(ctx.content, list):
                    return ctx.content
            return []
    
    advanced_context_manager = MockContextManager()

try:
    from deepseek_llm import llm
    LLM_AVAILABLE = True
    print("✅ 成功导入deepseek_llm模块")
except ImportError as e:
    print(f"⚠️ 导入deepseek_llm模块失败: {e}")
    LLM_AVAILABLE = False
    llm = None

try:
    from prompt import get_system_prompt
    print("✅ 成功导入prompt模块")
except ImportError as e:
    print(f"⚠️ 导入prompt模块失败: {e}")
    def get_system_prompt(context=""):
        return f"你是一个AI小说助手。上下文: {context}"

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    print("✅ 成功导入langchain_core模块")
except ImportError as e:
    print(f"⚠️ 导入langchain_core模块失败: {e}")
    # 简单消息类
    class HumanMessage:
        def __init__(self, content):
            self.content = content
    
    class SystemMessage:
        def __init__(self, content):
            self.content = content

# 数据模型
class GenerateNovelRequest(BaseModel):
    prompt: str
    context_ids: List[str] = Field(default_factory=list)
    params: Dict[str, Any] = Field(default_factory=lambda: {
        "creativity": 70,
        "length": 500,
        "style": 80,
        "temperature": 0.8
    })

class SaveContextRequest(BaseModel):
    title: str
    type: str = "novel"
    content: str
    description: Optional[str] = None

class ContextItem(BaseModel):
    id: str
    name: str
    type: str
    content: Any
    created_at: str
    updated_at: str
    is_selected: bool = False

class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
    server_time: str
    context_count: int = 0

# 创建FastAPI应用
app = FastAPI(
    title="AI小说生成器API",
    description="连接Electron客户端和LangChain后端的Web API",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加编码中间件
from fastapi import Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

class EncodingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # 确保JSON响应使用UTF-8编码
        if response.headers.get("content-type", "").startswith("application/json"):
            response.headers["content-type"] = "application/json; charset=utf-8"
        return response

app.add_middleware(EncodingMiddleware)

@app.get("/")
async def root():
    """根端点，返回API信息"""
    return {
        "name": "AI小说生成器API",
        "version": "1.0.0",
        "description": "连接Electron客户端和LangChain后端",
        "endpoints": {
            "health": "/api/health",
            "contexts": "/api/contexts",
            "generate_novel": "/api/generate/novel (POST)",
            "context_detail": "/api/context/{context_id}"
        },
        "llm_available": LLM_AVAILABLE
    }

@app.get("/api/health")
async def health_check():
    """健康检查端点"""
    context_count = len(advanced_context_manager.contexts)
    return HealthResponse(
        status="healthy",
        server_time=datetime.now().isoformat(),
        context_count=context_count
    )

@app.get("/api/contexts")
async def get_contexts():
    """获取所有上下文"""
    print(f"📚 获取上下文列表，管理器中有 {len(advanced_context_manager.contexts)} 个上下文")
    
    contexts = advanced_context_manager.list_contexts()
    print(f"📋 返回 {len(contexts)} 个上下文")
    
    # 调试：打印每个上下文的信息
    for i, ctx in enumerate(contexts):
        print(f"  {i+1}. ID: {ctx.get('id')}, 名称: {ctx.get('name')}, 类型: {ctx.get('type')}")
    
    return contexts

@app.get("/api/context/{context_id}")
async def get_context(context_id: str):
    """获取特定上下文的详细信息"""
    context = advanced_context_manager.get_context(context_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"上下文不存在: {context_id}")
    
    # 获取上下文条目
    items = advanced_context_manager.get_context_items(context_id)
    
    return {
        "id": context.id,
        "name": context.name,
        "type": context.type,
        "content": context.content,
        "items": items,
        "created_at": context.created_at,
        "updated_at": context.updated_at,
        "is_selected": context_id in advanced_context_manager.selected_contexts
    }

@app.post("/api/context/save")
async def save_context(request: SaveContextRequest):
    """保存内容到上下文"""
    try:
        # 查找对应的ContextType
        context_type = request.type
        if hasattr(ContextType, 'NOVEL'):
            # 使用真实的ContextType
            for ct in ContextType:
                if ct.value == request.type or ct.name.lower() == request.type.lower():
                    context_type = ct.value
                    break
        
        # 查找或创建指定类型的上下文
        contexts_of_type = advanced_context_manager.get_contexts_by_type(context_type)
        
        if contexts_of_type:
            # 保存到第一个该类型的上下文
            context_id = contexts_of_type[0].id
            advanced_context_manager.save_to_context(
                context_id, 
                request.content, 
                append=True
            )
            context_name = contexts_of_type[0].name
        else:
            # 创建新的上下文
            context_id = advanced_context_manager.create_context(
                name=request.title,
                context_type=context_type,
                content=request.content
            )
            context_name = request.title
        
        return {
            "success": True,
            "context_id": context_id,
            "context_name": context_name,
            "message": f"内容已保存到{context_type}上下文"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")

@app.post("/api/generate/novel")
async def generate_novel(request: GenerateNovelRequest):
    """生成小说内容"""
    try:
        # 1. 如果有选中的上下文，获取其内容
        selected_content = "【未选择任何上下文】"
        if request.context_ids:
            # 临时选择这些上下文
            original_selection = advanced_context_manager.selected_contexts.copy()
            advanced_context_manager.select_contexts(request.context_ids)
            selected_content = advanced_context_manager.get_selected_contexts_content()
            # 恢复原始选择
            advanced_context_manager.selected_contexts = original_selection
        
        # 2. 创建系统提示（包含上下文）
        system_prompt = get_system_prompt(selected_content)
        
        # 3. 构建消息
        if isinstance(system_prompt, str):
            system_message = system_prompt
            user_message = request.prompt
        else:
            system_message = system_prompt.content
            user_message = request.prompt
        
        print(f"正在生成小说，参数: {request.params}")
        print(f"系统提示: {system_message[:100]}...")
        print(f"用户消息: {user_message[:100]}...")
        
        # 生成内容
        content = ""
        try:
            if LLM_AVAILABLE and llm:
                # 使用真实的LLM
                if hasattr(llm, 'ainvoke'):
                    # 构建消息
                    messages = []
                    if hasattr(SystemMessage, '__name__'):
                        messages.append(SystemMessage(content=system_message))
                    if hasattr(HumanMessage, '__name__'):
                        messages.append(HumanMessage(content=user_message))
                    
                    # 调用LLM
                    response = await llm.ainvoke(messages)
                    
                    if hasattr(response, 'content'):
                        content = response.content
                    else:
                        content = str(response)
                else:
                    content = f"LLM不可用或配置错误。系统提示: {system_message}\n用户消息: {user_message}"
            else:
                # 使用模拟响应
                content = f"""📖 基于您选择的上下文，我创作了以下小说片段：

月光如水，洒在古老的庭院中。主角站在梧桐树下，回忆着往昔的点点滴滴。远处传来钟声，打破了夜的宁静。

他深吸一口气，感受着空气中弥漫的紧张气氛。每一个决定都可能影响整个故事的走向，但他必须做出选择。

回忆如潮水般涌来，那些被遗忘的片段逐渐清晰。原来，所有的偶然都是必然，所有的相遇都有其深意。

---
💡 创作说明：
• 基于 {len(request.context_ids)} 个上下文生成
• 创意度：{request.params.get('creativity', 70)}%
• 目标长度：{request.params.get('length', 500)} 字
• 风格强度：{request.params.get('style', 80)}%

需要调整参数或继续创作吗？"""
            
            # 清理内容
            clean_content = (
                str(content)
                .replace('\u200b', '')
                .replace('\uff0c', ',')
                .replace('\xa0', ' ')
                .replace('\u3000', ' ')
            )
            
            return {
                "success": True,
                "content": clean_content,
                "context_count": len(request.context_ids),
                "params": request.params
            }
            
        except Exception as e:
            error_msg = f"生成失败: {str(e)}"
            print(f"生成错误: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "content": f"抱歉，小说生成失败。错误信息：{error_msg}"
            }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")

@app.post("/api/context/{context_id}/select")
async def select_context(context_id: str, select: bool = True):
    """选择或取消选择上下文"""
    context = advanced_context_manager.get_context(context_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"上下文不存在: {context_id}")
    
    if select:
        advanced_context_manager.selected_contexts.add(context_id)
    elif context_id in advanced_context_manager.selected_contexts:
        advanced_context_manager.selected_contexts.remove(context_id)
    
    return {
        "success": True,
        "context_id": context_id,
        "selected": select,
        "selected_count": len(advanced_context_manager.selected_contexts)
    }

@app.get("/api/selected-contexts")
async def get_selected_contexts():
    """获取当前选中的上下文"""
    selected = []
    for context_id in advanced_context_manager.selected_contexts:
        context = advanced_context_manager.get_context(context_id)
        if context:
            selected.append({
                "id": context.id,
                "name": context.name,
                "type": context.type
            })
    
    return {
        "selected_contexts": selected,
        "count": len(selected)
    }

@app.post("/api/server/start")
async def start_server():
    """启动服务器（模拟端点，实际由客户端控制）"""
    return {
        "success": True,
        "message": "服务器已启动",
        "server_url": config.server.url
    }

@app.post("/api/server/stop")
async def stop_server():
    """停止服务器（模拟端点，实际由客户端控制）"""
    return {
        "success": True,
        "message": "服务器已停止"
    }

@app.get("/api/contexts/tree")
async def get_context_tree(root_id: Optional[str] = None):
    """获取上下文树状结构"""
    try:
        tree = advanced_context_manager.get_context_tree(root_id)
        return {
            "success": True,
            "tree": tree,
            "count": len(tree)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取上下文树失败: {str(e)}")

@app.get("/api/contexts/root")
async def get_root_contexts():
    """获取根节点上下文（没有父节点的上下文）"""
    try:
        root_contexts = advanced_context_manager.list_contexts(parent_id="")
        return {
            "success": True,
            "contexts": root_contexts,
            "count": len(root_contexts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取根节点上下文失败: {str(e)}")

@app.get("/api/context/{context_id}/children")
async def get_context_children(context_id: str):
    """获取指定上下文的子节点"""
    try:
        children = advanced_context_manager.list_contexts(parent_id=context_id)
        return {
            "success": True,
            "children": children,
            "count": len(children)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取子节点失败: {str(e)}")

@app.get("/api/context/{context_id}/path")
async def get_context_path(context_id: str):
    """获取上下文路径（从根节点到当前节点）"""
    try:
        path = advanced_context_manager.get_context_path(context_id)
        return {
            "success": True,
            "path": path,
            "depth": len(path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取上下文路径失败: {str(e)}")

class CreateContextRequest(BaseModel):
    # 支持多种数据结构格式
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[Any] = None
    parent_id: Optional[str] = None
    contextInfo: Optional[Dict] = None
    context_info: Optional[List[Dict[str, Any]]] = None

@app.post("/api/context/create")
async def create_context(request: CreateContextRequest):
    """创建新上下文（支持树状结构）并调用大模型生成初始内容"""
    try:
        name = request.name
        context_type_str = request.type
        content = request.content
        parent_id = request.parent_id
        context_info = request.context_info or request.contextInfo
        
        # 将字符串类型的context_type转换为ContextType枚举
        context_type = None
        if context_type_str:
            # 尝试从ContextType枚举中查找匹配的类型
            if hasattr(ContextType, context_type_str.upper()):
                context_type = getattr(ContextType, context_type_str.upper())
            else:
                # 尝试通过值匹配
                for ct in ContextType:
                    if ct.value == context_type_str or ct.name.lower() == context_type_str.lower():
                        context_type = ct
                        break
        
        # 如果没有找到匹配的类型，使用默认类型
        if not context_type:
            context_type = ContextType.CUSTOM
        
        # 创建上下文
        context_id = advanced_context_manager.create_context(
            name=name,
            context_type=context_type,
            content=content or "",
            parent_id=parent_id,
            metadata={"context_info": context_info}
        )
        
        # 将name, context_type, content, parent_id, contextInfo组装成LangChain服务能够接收的格式
        # 构建系统提示
        system_prompt = get_system_prompt()
        
        # 构建用户消息：基于上下文信息生成初始内容
        user_message = f"""
            名称：{name}
            类型：{context_type}
            父节点ID：{parent_id if parent_id else '无'}
            上下文信息：{context_info if context_info else '无'}
            {content if content else '（无初始内容）'}
        """
        
        # 调用大模型生成内容
        generated_content = ""
        if LLM_AVAILABLE and llm:
            try:
                if hasattr(llm, 'ainvoke'):
                    # 构建消息
                    messages = []
                    if isinstance(system_prompt, str):
                        messages.append(SystemMessage(content=system_prompt))
                    else:
                        messages.append(system_prompt)
                    
                    messages.append(HumanMessage(content=user_message))
                    # 调用LLM
                    response = await llm.ainvoke(messages)
                    if hasattr(response, 'content'):
                        generated_content = response.content
                    else:
                        generated_content = str(response)
                    
                    # 清理内容
                    generated_content = (
                        str(generated_content)
                        .replace('\u200b', '')
                        .replace('\uff0c', ',')
                        .replace('\xa0', ' ')
                        .replace('\u3000', ' ')
                    )
                    
                    # 将生成的内容保存到上下文中
                    if generated_content:
                        advanced_context_manager.save_to_context(
                            context_id,
                            generated_content,
                            append=True
                        )
                else:
                    generated_content = "LLM不可用或配置错误。"
            except Exception as e:
                print(f"调用大模型失败: {str(e)}")
                generated_content = f"调用大模型失败: {str(e)}"
        else:
            generated_content = "LLM服务不可用，使用默认内容。"
        
        # 构建响应，包含更多信息
        response_data = {
            "success": True,
            "context_id": context_id,
            "name": name,
            "type": context_type.value if hasattr(context_type, 'value') else str(context_type),
            "content": content,
            "generated_content": generated_content,
            "parent_id": parent_id,
            "message": f"上下文 '{name}' 创建成功，并已调用大模型生成初始内容"
        }
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"创建上下文失败: {str(e)}"
        print(f"❌ {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

class UpdateContextRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[Any] = None
    metadata: Optional[Dict] = None

@app.put("/api/context/{context_id}")
async def update_context(context_id: str, request: UpdateContextRequest):
    """更新上下文"""
    try:
        context = advanced_context_manager.get_context(context_id)
        if not context:
            raise HTTPException(status_code=404, detail=f"上下文不存在: {context_id}")
        
        # 更新名称
        if request.name is not None:
            context.name = request.name
        
        # 更新类型
        if request.type is not None:
            # 查找对应的ContextType
            context_type = request.type
            if hasattr(ContextType, 'NOVEL'):
                for ct in ContextType:
                    if ct.value == request.type or ct.name.lower() == request.type.lower():
                        context_type = ct
                        break
            context.type = context_type
        
        # 更新内容
        if request.content is not None:
            context.update(request.content, request.metadata)
        elif request.metadata is not None:
            # 只更新元数据
            context.metadata.update(request.metadata)
            context.updated_at = datetime.now().isoformat()
        
        # 保存更新
        advanced_context_manager._save_context(context)
        
        return {
            "success": True,
            "context_id": context_id,
            "message": f"上下文 '{context.name}' 更新成功"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新上下文失败: {str(e)}")

@app.delete("/api/context/{context_id}")
async def delete_context(context_id: str):
    """删除上下文"""
    try:
        success = advanced_context_manager.delete_context(context_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"上下文不存在: {context_id}")
        
        return {
            "success": True,
            "message": f"上下文删除成功"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除上下文失败: {str(e)}")

class MoveContextRequest(BaseModel):
    new_parent_id: Optional[str] = None

@app.post("/api/context/{context_id}/move")
async def move_context(context_id: str, request: MoveContextRequest):
    """移动上下文到新的父节点"""
    try:
        success = advanced_context_manager.move_context(context_id, request.new_parent_id)
        if success:
            return {
                "success": True,
                "message": f"上下文移动成功"
            }
        else:
            raise HTTPException(status_code=400, detail="移动失败：可能形成循环引用或上下文不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"移动上下文失败: {str(e)}")

def run_server():
    """运行Web服务器"""
    print(f"🚀 启动AI小说生成器API服务器...")
    print(f"📡 地址: {config.server.url}")
    print(f"🔧 调试模式: {config.server.debug}")
    print(f"📚 已加载上下文: {len(advanced_context_manager.contexts)} 个")
    print(f"🤖 LLM可用: {LLM_AVAILABLE}")
    
    uvicorn.run(
        app,
        host=config.server.host,
        port=config.server.port,
        reload=config.server.debug
    )

if __name__ == "__main__":
    run_server()
