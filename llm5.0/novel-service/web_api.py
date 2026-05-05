"""
Web API服务器 - 连接Electron客户端和LangChain后端
"""
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
from starlette.middleware.base import BaseHTTPMiddleware
from prompt import prompt as system_prompt
from llm import llm
from context_manager import advanced_context_manager, ContextType
from agent_service import AgentService
from langchain_core.messages import HumanMessage

# 导入fanqie_tool模块
try:
    from fanqie_tool import novel_tool
except ImportError as e:
    print(f"⚠️ 导入fanqie_tool模块失败: {e}")
    novel_tool = None

# 导入配置模块
try:
    from config import config
except ImportError as e:
    print(f"⚠️ 导入config模块失败: {e}")
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


def resolve_context_type(type_str: Optional[str], default: ContextType = ContextType.CUSTOM) -> ContextType:
    """将字符串类型解析为ContextType枚举"""
    if not type_str:
        return default
    # 先按枚举名匹配
    if hasattr(ContextType, type_str.upper()):
        return getattr(ContextType, type_str.upper())
    # 再按值或名称（忽略大小写）匹配
    for ct in ContextType:
        if ct.value == type_str or ct.name.lower() == type_str.lower():
            return ct
    return default




def deduplicate_context_info(context_info: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    """
    去重context_info中的重复上下文，并为每个context_info添加唯一id
    
    参数:
        context_info: 上下文信息列表，每个元素是一个字典
    
    返回:
        去重后的上下文信息列表，每个元素都有唯一的id字段
    """
    if not context_info:
        return context_info
    
    # 用于跟踪已见过的上下文标识
    seen_ids = set()
    deduplicated = []
    
    for index, item in enumerate(context_info):
        # 确保每个context_info都有id字段
        if 'id' not in item or not item['id']:
            # 生成基于内容和索引的哈希作为id
            import hashlib
            content_str = str(item.get('content', '')) + str(item.get('type', '')) + str(index)
            item_id = hashlib.md5(content_str.encode('utf-8')).hexdigest()[:8]
            item['id'] = item_id
            print(f"📝 为context_info生成id: {item_id}")
        
        # 使用id作为唯一标识
        item_id = item['id']
        
        # 如果这个标识还没有出现过，添加到结果中
        if item_id not in seen_ids:
            seen_ids.add(item_id)
            deduplicated.append(item)
        else:
            print(f"⚠️ 检测到重复上下文，已去重: {item_id} (类型: {item.get('type', '未知')})")
    
    # 打印去重统计信息
    if len(context_info) != len(deduplicated):
        print(f"✅ 上下文去重完成: {len(context_info)} -> {len(deduplicated)} 个，减少了 {len(context_info) - len(deduplicated)} 个重复项")
    
    return deduplicated


# 数据模型
class SaveContextRequest(BaseModel):
    title: str
    type: str = "novel"
    content: str
    description: Optional[str] = None

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

class EncodingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if response.headers.get("content-type", "").startswith("application/json"):
            response.headers["content-type"] = "application/json; charset=utf-8"
        return response

app.add_middleware(EncodingMiddleware)


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
    return advanced_context_manager.list_contexts()

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
        context_type_enum = resolve_context_type(request.type, ContextType.NOVEL)
        
        # 查找或创建指定类型的上下文
        contexts_of_type = advanced_context_manager.get_contexts_by_type(context_type_enum)
        
        if contexts_of_type:
            context_id = contexts_of_type[0].id
            advanced_context_manager.save_to_context(context_id, request.content, append=True)
            context_name = contexts_of_type[0].name
        else:
            context_id = advanced_context_manager.create_context(
                name=request.title, context_type=context_type_enum, content=request.content
            )
            context_name = request.title
        
        return {
            "success": True,
            "context_id": context_id,
            "context_name": context_name,
            "message": f"内容已保存到{context_type_enum.value}上下文"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


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

def _parse_ai_json_nodes(ai_content: str, parent_id: Optional[str]) -> List[Dict]:
    """解析AI返回的JSON数组，提取节点列表"""
    content = ai_content.strip()
    # 去除可能的markdown代码块包裹
    if content.startswith("```"):
        lines = content.split("\n")
        # 去掉首行(如```json)和末行(```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines).strip()
    
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None  # 返回None表示解析失败，需要走原逻辑
    
    if not isinstance(parsed, list):
        parsed = [parsed]
    
    nodes = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        node = {
            "name": item.get("name", "未命名节点"),
            "type": item.get("type", "自定义"),
            "content": item.get("content", ""),
            "parent_id": item.get("parent_id", parent_id)
        }
        # 如果parent_id为None或空，使用请求中的parent_id
        if not node["parent_id"]:
            node["parent_id"] = parent_id
        nodes.append(node)
    
    return nodes


@app.post("/api/context/create")
async def create_context(request: CreateContextRequest):
    """创建新上下文（支持树状结构）并调用大模型生成初始内容，AI自动判断生成一个或多个节点"""
    try:
        context_type = resolve_context_type(request.type)
        context_info = request.context_info or request.contextInfo
        
        # 去重处理
        deduplicated_info = deduplicate_context_info(context_info) if context_info else context_info
        
        # 格式化上下文信息
        context_info_str = "无"
        if deduplicated_info:
            items = []
            for ctx in deduplicated_info:
                ctx_content = ctx.get('content', '')
                preview = ctx_content[:100] + "..." if len(ctx_content) > 100 else ctx_content
                items.append(f"ID: {ctx.get('id', '未知ID')}, 类型: {ctx.get('type', '未知类型')}, 内容预览: {preview}")
            context_info_str = "\n".join(items)
        
        user_message = f"""
            名称：{request.name}
            类型：{context_type}
            父节点ID：{request.parent_id if request.parent_id is not None else ''}
            上下文信息：{context_info_str}
            内容: {request.content if request.content else '（无初始内容）'}
        """
        
        # 存储请求中的parent_id，供后续创建节点使用
        request_parent_id = request.parent_id
        
        async def event_generator():
            # 按需加载工具：只有用户输入包含番茄链接时才带novel_tool
            needs_tool = novel_tool and 'fanqienovel.com/page/' in user_message
            if needs_tool:
                from prompt import get_system_prompt_with_tool
                agent_service = AgentService(llm, get_system_prompt_with_tool(), tools=[novel_tool])
            else:
                agent_service = AgentService(llm, system_prompt, tools=[])
            accumulated_ai_content = ""
            nodes_created = False
            
            async for event_str in agent_service.stream(user_message):
                yield event_str + "\n"
                
                # 累积AI消息内容
                try:
                    event_data = json.loads(event_str)
                    if event_data.get("type") == "ai_message":
                        accumulated_ai_content += event_data.get("content", "")
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # 流式结束后，尝试解析AI返回的JSON并创建节点
            if accumulated_ai_content.strip():
                nodes = _parse_ai_json_nodes(accumulated_ai_content, request_parent_id)
                
                if nodes is not None and len(nodes) > 0:
                    # 成功解析为节点列表，批量创建
                    created_ids = []
                    for node in nodes:
                        node_type = resolve_context_type(node["type"])
                        node_id = advanced_context_manager.create_context(
                            name=node["name"],
                            context_type=node_type,
                            content=node["content"],
                            parent_id=node["parent_id"]
                        )
                        created_ids.append({"id": node_id, "name": node["name"], "type": node["type"]})
                    
                    # 发送节点创建结果事件
                    result_event = json.dumps({
                        "type": "nodes_created",
                        "nodes": created_ids,
                        "count": len(created_ids)
                    }, ensure_ascii=False)
                    yield result_event + "\n"
                    nodes_created = True
                
                if not nodes_created:
                    # 解析失败，按原逻辑创建单个节点
                    node_id = advanced_context_manager.create_context(
                        name=request.name or "新节点",
                        context_type=context_type,
                        content=accumulated_ai_content,
                        parent_id=request_parent_id
                    )
                    result_event = json.dumps({
                        "type": "nodes_created",
                        "nodes": [{"id": node_id, "name": request.name or "新节点", "type": context_type.value}],
                        "count": 1
                    }, ensure_ascii=False)
                    yield result_event + "\n"
        
        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建上下文失败: {str(e)}")

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
            context_type_enum = resolve_context_type(request.type)
            if context_type_enum:
                context.type = context_type_enum
        
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
        if not advanced_context_manager.delete_context(context_id):
            raise HTTPException(status_code=404, detail=f"上下文不存在: {context_id}")
        return {"success": True, "message": "上下文删除成功"}
    except HTTPException:
        raise
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

# ==================== AI生成API端点 ====================

class AiGenerateRequest(BaseModel):
    """AI生成请求"""
    prompt: str
    selected_contexts: Optional[List[str]] = None
    parameters: Optional[Dict[str, Any]] = None

class AiGenerateResponse(BaseModel):
    """AI生成响应"""
    success: bool
    content: str
    context_used: Optional[List[str]] = None
    error: Optional[str] = None

@app.post("/api/ai/generate", response_model=AiGenerateResponse)
async def generate_ai_content(request: AiGenerateRequest):
    """生成AI内容"""
    try:
        # 构建上下文内容
        context_content = ""
        if request.selected_contexts:
            for context_id in request.selected_contexts:
                context = advanced_context_manager.get_context(context_id)
                if context:
                    context_content += f"\n\n【上下文ID: {context.id}, 名称: {context.name}, 类型: {context.type}】\n"
                    if isinstance(context.content, list):
                        for item in context.content:
                            context_content += f"{item.get('content', '') if isinstance(item, dict) else str(item)}\n"
                    else:
                        context_content += f"{str(context.content)}\n"
        
        # 构建用户消息
        if context_content:
            user_message = f"基于以下上下文信息：\n{context_content}\n请根据以下指令进行处理：\n{request.prompt}"
        else:
            user_message = request.prompt
        
        # 调用LLM
        messages = [system_prompt, HumanMessage(content=user_message)] if system_prompt else [HumanMessage(content=user_message)]
        response = await llm.ainvoke(messages)
        generated_content = str(getattr(response, 'content', response))
        
        # 清理内容
        for old, new in [('\u200b', ''), ('\uff0c', ','), ('\xa0', ' '), ('\u3000', ' ')]:
            generated_content = generated_content.replace(old, new)
        
        return AiGenerateResponse(success=True, content=generated_content, context_used=request.selected_contexts)
    except Exception as e:
        return AiGenerateResponse(success=False, content="", error=f"AI生成失败: {str(e)}")


def run_server():
    """运行Web服务器"""
    print(f"🚀 启动AI小说生成器API服务器...")
    print(f"📡 地址: {config.server.url}")
    print(f"🔧 调试模式: {config.server.debug}")
    print(f"📚 已加载上下文: {len(advanced_context_manager.contexts)} 个")
    
    if config.server.debug:
        # 在调试模式下，使用导入字符串
        uvicorn.run(
            "web_api:app",
            host=config.server.host,
            port=config.server.port,
            reload=True
        )
    else:
        # 在生产模式下，直接使用app对象
        uvicorn.run(
            app,
            host=config.server.host,
            port=config.server.port,
            reload=False
        )

if __name__ == "__main__":
    run_server()
