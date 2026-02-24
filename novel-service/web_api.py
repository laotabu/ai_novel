"""
Web API服务器 - 连接Electron客户端和LangChain后端
"""
import json
import os
import sys
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
from starlette.middleware.base import BaseHTTPMiddleware
from prompt import prompt as system_prompt
from deepseek_llm import llm
from context_manager import advanced_context_manager, ContextType
# 导入fanqie_tool模块
try:
    from fanqie_tool import novel_tool, FanqieNovelParser
    print("✅ 成功导入fanqie_tool模块")
except ImportError as e:
    print(f"⚠️ 导入fanqie_tool模块失败: {e}")
    novel_tool = None
    FanqieNovelParser = None

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



# 导入langchain_core.messages，如果失败则创建本地类
try:
    from langchain_core.messages import HumanMessage as LangchainHumanMessage
    from langchain_core.messages import SystemMessage as LangchainSystemMessage
    print("✅ 成功导入langchain_core模块")
    # 创建别名以便在代码中使用
    HumanMessage = LangchainHumanMessage
    SystemMessage = LangchainSystemMessage
except ImportError as e:
    print(f"⚠️ 导入langchain_core模块失败: {e}")
    # 简单消息类
    class HumanMessage:
        def __init__(self, content):
            self.content = content
    
    class SystemMessage:
        def __init__(self, content):
            self.content = content


def format_novel_result(novel_data: dict, original_url: str = "") -> str:
    """
    封装小说解析结果，去除番茄链接信息，提供清晰格式
    
    参数:
        novel_data: 小说数据字典
        original_url: 原始URL（可选，用于记录但不显示）
    
    返回:
        格式化的小说信息字符串
    """
    # 提取小说信息
    title = novel_data.get('title', '未知标题')
    status_list = novel_data.get('status', [])
    status = ', '.join(status_list) if status_list else '未知状态'
    word_count = novel_data.get('word_count', '未知字数')
    
    # 处理最后更新信息
    last_update = novel_data.get('last_update', {})
    last_chapter = last_update.get('chapter', '未知章节')
    last_time = last_update.get('time', '未知时间')
    
    # 处理简介
    summary = novel_data.get('summary', '无简介')
    
    # 处理目录信息（如果有）
    toc = novel_data.get('toc', [])
    toc_info = ""
    if toc:
        # 只显示前5章
        visible_chapters = toc[:5]
        chapter_titles = [chap.get('title', '未知章节') for chap in visible_chapters]
        locked_count = sum(1 for chap in visible_chapters if chap.get('locked', False))
        toc_info = f"\n目录预览（前{len(visible_chapters)}章）: {', '.join(chapter_titles)}"
        if locked_count > 0:
            toc_info += f"\n其中有{locked_count}章是付费章节"
    
    # 构建格式化结果
    formatted_result = f"""📚 小说解析结果：

📖 标题: {title}
🏷️ 状态: {status}
📊 字数: {word_count}
🕒 最后更新: {last_chapter} ({last_time})

📝 简介:
{summary}
"""
    
    # 添加目录信息（如果有）
    if toc_info:
        formatted_result += f"\n{toc_info}"
    
    # 添加解析成功提示（但不显示原始URL）
    formatted_result += f"\n\n✅ 小说信息解析完成"
    
    return formatted_result


def deduplicate_context_info(context_info: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    """
    去重context_info中的重复上下文
    
    参数:
        context_info: 上下文信息列表，每个元素是一个字典
    
    返回:
        去重后的上下文信息列表
    """
    if not context_info:
        return context_info
    
    # 用于跟踪已见过的上下文标识
    seen_ids = set()
    deduplicated = []
    
    for item in context_info:
        # 尝试获取上下文的唯一标识
        # 可能是id、context_id、name等字段
        item_id = None
        
        # 尝试不同的字段作为标识
        for field in ['id', 'context_id', 'name', 'title']:
            if field in item and item[field]:
                item_id = str(item[field])
                break
        
        # 如果没有找到标识字段，使用整个字典的字符串表示
        if not item_id:
            item_id = str(item)
        
        # 如果这个标识还没有出现过，添加到结果中
        if item_id not in seen_ids:
            seen_ids.add(item_id)
            deduplicated.append(item)
        else:
            print(f"⚠️ 检测到重复上下文，已去重: {item_id}")
    
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
        # 查找对应的ContextType枚举
        context_type_enum = None
        if hasattr(ContextType, 'NOVEL'):
            # 使用真实的ContextType枚举
            for ct in ContextType:
                if ct.value == request.type or ct.name.lower() == request.type.lower():
                    context_type_enum = ct
                    break
        
        # 如果没有找到匹配的类型，使用默认类型
        if not context_type_enum:
            context_type_enum = ContextType.NOVEL if hasattr(ContextType, 'NOVEL') else ContextType.CUSTOM
        
        # 查找或创建指定类型的上下文
        contexts_of_type = advanced_context_manager.get_contexts_by_type(context_type_enum)
        
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
                context_type=context_type_enum,
                content=request.content
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

@app.post("/api/context/create")
async def create_context(request: CreateContextRequest):
    """创建新上下文（支持树状结构）并调用大模型生成初始内容"""
    try:
        name = request.name
        context_type_str = request.type
        content = request.content
        parent_id = request.parent_id
        context_info = request.context_info or request.contextInfo
        print(request)
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
        
        # 对context_info进行去重处理，避免重复上下文消耗token
        deduplicated_context_info = None
        if context_info:
            deduplicated_context_info = deduplicate_context_info(context_info)
            print(f"📊 上下文去重统计: 原始 {len(context_info) if context_info else 0} 个 -> 去重后 {len(deduplicated_context_info) if deduplicated_context_info else 0} 个")
        else:
            deduplicated_context_info = context_info
        
        # 创建上下文
        context_id = advanced_context_manager.create_context(
            name=name,
            context_type=context_type,
            # content=content or "",
            content="",
            parent_id=parent_id,
            metadata={"context_info": deduplicated_context_info}
        )
        
        # 构建用户消息：基于上下文信息生成初始内容
        # 根据用户要求：根节点创建上下文信息的时候，parent_id为null，不要填充虚拟id
        user_message = f"""
            名称：{name}
            类型：{context_type}
            父节点ID：{parent_id if parent_id is not None else ''}
            上下文信息：{deduplicated_context_info if deduplicated_context_info else '无'}
            内容: {content if content else '（无初始内容）'}
        """
        print(f"用户消息: {user_message}")
        
        # 检测用户消息中是否包含番茄小说链接（精确匹配fanqienovel.com/page/）
        import re
        # 更精确的匹配模式：必须包含fanqienovel.com/page/
        fanqie_pattern = r'https?://[^\s]*fanqienovel\.com/page/[^\s]*'
        fanqie_matches = re.findall(fanqie_pattern, user_message)
        has_fanqie_link = len(fanqie_matches) > 0
        
        if has_fanqie_link:
            print(f"🔍 检测到番茄小说链接: {fanqie_matches}")
            # 如果有番茄链接，在用户消息中添加明确指示
            fanqie_url = fanqie_matches[0]
            user_message += f"\n\n重要提示：检测到番茄小说链接。请使用novel_tool工具解析此链接。链接: {fanqie_url}"
        else:
            # 也检查是否包含fanqienovel.com但不包含/page/，这可能是其他页面
            other_fanqie_pattern = r'https?://[^\s]*fanqienovel\.com[^\s]*'
            other_matches = re.findall(other_fanqie_pattern, user_message)
            if other_matches:
                print(f"⚠️ 检测到番茄网站链接但不是小说详情页: {other_matches}")
                print("ℹ️ 这不是小说详情页链接，不会调用novel_tool工具")
        
        # 调用大模型生成内容
        generated_content = ""
        success = True
        try:
            if llm and hasattr(llm, 'ainvoke'):
                # 构建消息
                messages = []
    
                # 添加系统消息（如果可用）
                if system_prompt:
                    messages.append(system_prompt)
                
                # 添加用户消息
                messages.append(HumanMessage(content=user_message))
                print(f"构建消息列表，消息数量: {len(messages)}")
                
                # 只有在检测到番茄链接时才绑定工具到LLM
                current_llm = llm
                if novel_tool and has_fanqie_link:
                    try:
                        # 绑定工具到LLM
                        current_llm = llm.bind_tools([novel_tool])
                        print(f"✅ 检测到番茄链接，已绑定novel_tool到LLM")
                    except Exception as bind_error:
                        print(f"⚠️ 绑定工具失败: {bind_error}")
                elif novel_tool:
                    print("ℹ️ 未检测到番茄链接，不绑定工具到LLM")
                else:
                    print("ℹ️ novel_tool不可用，使用基础LLM")
                
                # 调用LLM
                print(f"调用LLM，是否绑定工具: {current_llm != llm}")
                response = await current_llm.ainvoke(messages)
                print(f"LLM响应类型: {type(response)}")
                print(f"LLM响应: {response}")
                
                # 处理响应，检查是否有工具调用
                if hasattr(response, 'tool_calls') and response.tool_calls:
                    print(f"🔧 LLM调用了工具: {response.tool_calls}")
                    # 处理工具调用
                    tool_calls_processed = False
                    for tool_call in response.tool_calls:
                        if tool_call['name'] == 'novel_tool':
                            print(f"🛠️ 执行novel_tool工具调用")
                            # 从工具调用参数中获取URL
                            tool_args = tool_call.get('args', {})
                            fanqie_url = tool_args.get('url', '')
                            tool_context_id = tool_args.get('context_id', context_id)
                            
                            if not fanqie_url:
                                # 如果没有提供URL，尝试从用户消息中提取
                                import re
                                fanqie_pattern = r'https?://[^\s]*fanqienovel\.com[^\s]*'
                                matches = re.findall(fanqie_pattern, user_message)
                                if matches:
                                    fanqie_url = matches[0]
                                    print(f"🔍 从用户消息中提取番茄链接: {fanqie_url}")
                            
                            if fanqie_url:
                                # 执行工具调用
                                try:
                                    tool_result = novel_tool.invoke({
                                        'url': fanqie_url,
                                        'context_id': tool_context_id
                                    })
                                    print(f"工具执行结果: {tool_result}")
                                    
                                    # 将工具结果添加到生成内容中，并进行封装处理
                                    if isinstance(tool_result, str):
                                        try:
                                            tool_result_json = json.loads(tool_result)
                                            if tool_result_json.get('status') == 'success':
                                                novel_data = tool_result_json.get('data', {})
                                                # 封装结果，去除番茄链接信息
                                                generated_content = format_novel_result(novel_data, fanqie_url)
                                                
                                                # 如果工具调用成功，还可以将解析结果保存到上下文
                                                saved_context_id = tool_result_json.get('context_id')
                                                if saved_context_id:
                                                    generated_content += f"\n\n小说数据已保存到上下文: {saved_context_id}"
                                            else:
                                                generated_content = f"解析番茄链接失败: {tool_result_json.get('data', {}).get('message', '未知错误')}"
                                        except json.JSONDecodeError:
                                            generated_content = f"工具返回结果解析失败: {tool_result}"
                                    else:
                                        generated_content = f"工具执行完成: {str(tool_result)[:200]}..."
                                    
                                    tool_calls_processed = True
                                except Exception as tool_error:
                                    generated_content = f"工具执行失败: {str(tool_error)}"
                            else:
                                generated_content = "LLM尝试调用novel_tool但没有提供有效的番茄链接URL。"
                        else:
                            generated_content = f"LLM调用了未知工具: {tool_call['name']}"
                    
                    # 如果没有处理任何工具调用，使用LLM的响应内容
                    if not tool_calls_processed and hasattr(response, 'content'):
                        generated_content = response.content
                elif hasattr(response, 'content'):
                    generated_content = response.content
                else:
                    generated_content = str(response)
                    
                # 如果检测到番茄链接但LLM没有调用工具，我们强制调用工具
                if has_fanqie_link and not (hasattr(response, 'tool_calls') and response.tool_calls):
                    print(f"⚠️ 检测到番茄链接但LLM没有调用工具，强制调用工具")
                    fanqie_url = fanqie_matches[0]
                    try:
                        tool_result = novel_tool.invoke({
                            'url': fanqie_url,
                            'context_id': context_id
                        })
                        print(f"强制工具执行结果: {tool_result}")
                        
                        # 将工具结果添加到生成内容中，并进行封装处理
                        if isinstance(tool_result, str):
                            try:
                                tool_result_json = json.loads(tool_result)
                                if tool_result_json.get('status') == 'success':
                                    novel_data = tool_result_json.get('data', {})
                                    # 封装结果，去除番茄链接信息
                                    generated_content = format_novel_result(novel_data, fanqie_url)
                                    
                                    # 如果工具调用成功，还可以将解析结果保存到上下文
                                    saved_context_id = tool_result_json.get('context_id')
                                    if saved_context_id:
                                        generated_content += f"\n\n小说数据已保存到上下文: {saved_context_id}"
                                else:
                                    generated_content = f"解析番茄链接失败: {tool_result_json.get('data', {}).get('message', '未知错误')}"
                            except json.JSONDecodeError:
                                generated_content = f"工具返回结果解析失败: {tool_result}"
                        else:
                            generated_content = f"工具执行完成: {str(tool_result)[:200]}..."
                    except Exception as tool_error:
                        generated_content = f"强制工具执行失败: {str(tool_error)}"
                    
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
            import traceback
            traceback.print_exc()
            generated_content = f"调用大模型失败: {str(e)}"
            success = False

        
        # 构建响应，包含更多信息
        response_data = {
            "success": success,
            "context_id": context_id,
            "name": name,
            "type": context_type.value if hasattr(context_type, 'value') else str(context_type),
            "content": content,
            "generated_content": generated_content,
            "parent_id": parent_id
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
            # 查找对应的ContextType枚举
            context_type_enum = None
            if hasattr(ContextType, 'NOVEL'):
                for ct in ContextType:
                    if ct.value == request.type or ct.name.lower() == request.type.lower():
                        context_type_enum = ct
                        break
            
            # 如果没有找到匹配的类型，保持原类型
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
    print(f"🗑️ 请求删除上下文: {context_id}")
    try:
        success = advanced_context_manager.delete_context(context_id)
        print(f"🗑️ 删除上下文 {context_id}，结果: {'成功' if success else '失败'}")
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

class ParseNovelRequest(BaseModel):
    """解析小说链接请求"""
    url: str
    context_id: Optional[str] = None

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
