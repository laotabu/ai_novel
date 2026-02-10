from agent import agent
from context_manager import advanced_context_manager
from context_manager import ContextType
import json, os, sys
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage
from typing import List, Dict, Any


# ==================== 辅助函数 ====================
def get_selected_contexts_content() -> str:
    """获取选中上下文的组合内容"""
    return advanced_context_manager.get_selected_contexts_content()

def show_save_menu(content: str) -> str:
    """显示保存菜单并处理用户选择（支持自动创建上下文和条目）"""
    print("\n💾 保存选项:")
    print("1. 保存到会话历史 (默认)")
    print("2. 保存到现有上下文")
    print("3. 保存到新上下文（自动创建）")
    print("4. 作为新条目保存到现有上下文")
    print("5. 不保存")
    
    choice = input("请选择 (1-5, 默认1): ").strip()
    
    if choice == "2":
        # 保存到现有上下文（追加模式）
        contexts = list(advanced_context_manager.contexts.values())
        if not contexts:
            print("⚠️  没有可用的上下文，请先创建上下文或选择选项3自动创建")
            return "未保存"
        
        print("\n📚 可用上下文:")
        for i, ctx in enumerate(contexts, 1):
            print(f"{i}. {ctx.id} - {ctx.name} ({ctx.type.value})")
        
        try:
            ctx_choice = input("请选择上下文编号 (输入0取消): ").strip()
            if ctx_choice == "0":
                return "取消保存"
            
            idx = int(ctx_choice) - 1
            if 0 <= idx < len(contexts):
                selected_ctx = contexts[idx]
                advanced_context_manager.save_to_context(selected_ctx.id, content, append=True)
                return f"✅ 已保存到 {selected_ctx.name}"
            else:
                print("❌ 无效选择")
                return "未保存"
        except ValueError:
            print("❌ 请输入有效数字")
            return "未保存"
    
    elif choice == "3":
        # 保存到新上下文（自动创建）
        print("\n📝 创建新上下文:")
        print("支持的上下文类型:")
        for i, ct in enumerate(ContextType, 1):
            print(f"{i}. {ct.value} ({ct.name})")
        
        try:
            type_choice = input("请选择上下文类型编号: ").strip()
            idx = int(type_choice) - 1
            if 0 <= idx < len(ContextType):
                context_type = list(ContextType)[idx]
                name = input(f"请输入上下文名称 (默认: '新建{context_type.value}'): ").strip()
                if not name:
                    name = f"新建{context_type.value}"
                
                # 自动创建上下文并保存内容
                ctx_id = advanced_context_manager.create_context(
                    name=name,
                    context_type=context_type,
                    content=content
                )
                return f"✅ 已创建并保存到新上下文: {name} ({ctx_id})"
            else:
                print("❌ 无效选择")
                return "未保存"
        except ValueError:
            print("❌ 请输入有效数字")
            return "未保存"
    
    elif choice == "4":
        # 作为新条目保存到现有上下文
        contexts = list(advanced_context_manager.contexts.values())
        if not contexts:
            print("⚠️  没有可用的上下文，请先创建上下文")
            return "未保存"
        
        print("\n📚 可用上下文:")
        for i, ctx in enumerate(contexts, 1):
            print(f"{i}. {ctx.id} - {ctx.name} ({ctx.type.value})")
        
        try:
            ctx_choice = input("请选择上下文编号 (输入0取消): ").strip()
            if ctx_choice == "0":
                return "取消保存"
            
            idx = int(ctx_choice) - 1
            if 0 <= idx < len(contexts):
                selected_ctx = contexts[idx]
                # 作为新条目保存
                item_id = advanced_context_manager.add_context_item(selected_ctx.id, content)
                return f"✅ 已作为新条目保存到 {selected_ctx.name} (条目ID: {item_id})"
            else:
                print("❌ 无效选择")
                return "未保存"
        except ValueError:
            print("❌ 请输入有效数字")
            return "未保存"
    
    elif choice == "5":
        return "未保存"
    
    else:
        # 默认保存到会话历史
        history_contexts = advanced_context_manager.get_contexts_by_type(ContextType.HISTORY)
        if history_contexts:
            advanced_context_manager.save_to_context(history_contexts[0].id, content, append=True)
            return "✅ 已保存到会话历史"
        else:
            # 自动创建会话历史上下文
            ctx_id = advanced_context_manager.create_context(
                name="会话历史",
                context_type=ContextType.HISTORY,
                content=content
            )
            return f"✅ 已创建并保存到新会话历史: {ctx_id}"

# ==================== 上下文管理命令处理 ====================
def handle_context_command(command: str) -> str:
    """处理上下文管理命令（新版本，支持多选和多种类型）"""
    parts = command.strip().split()
    if not parts:
        return "无效命令格式。输入 /help 查看可用命令。"
    
    cmd = parts[0].lower()
    
    if cmd == "/context" and len(parts) > 1:
        subcmd = parts[1].lower()
        
        if subcmd == "list":
            contexts = list(advanced_context_manager.contexts.values())
            if not contexts:
                return "暂无保存的上下文。"
            
            result = "📚 所有上下文:\n"
            for ctx in contexts:
                is_selected = "✅" if ctx.id in advanced_context_manager.selected_contexts else "  "
                item_count = len(ctx.content)
                selected_item_count = len(ctx.selected_items)
                result += f"{is_selected} {ctx.id} - {ctx.name} ({ctx.type.value}) [{item_count}条目"
                if selected_item_count > 0:
                    result += f", {selected_item_count}选中"
                result += "]\n"
                
                # 显示内容预览（第一个条目的内容）
                if ctx.content and len(ctx.content) > 0:
                    first_item_content = ctx.content[0].get("content", "")
                    preview = str(first_item_content)[:50]
                    if preview:
                        result += f"    预览: {preview}...\n"
            return result
        
        elif subcmd == "select" and len(parts) > 2:
            # 多选上下文: /context select id1 id2 id3
            context_ids = parts[2:]
            advanced_context_manager.select_contexts(context_ids)
            selected_count = len(advanced_context_manager.selected_contexts)
            return f"✅ 已选择 {selected_count} 个上下文"
        
        elif subcmd == "deselect" and len(parts) > 2:
            # 取消选择: /context deselect id1 id2
            context_ids = parts[2:]
            for ctx_id in context_ids:
                if ctx_id in advanced_context_manager.selected_contexts:
                    advanced_context_manager.selected_contexts.remove(ctx_id)
            return f"✅ 已取消选择 {len(context_ids)} 个上下文"
        
        elif subcmd == "selected":
            selected = advanced_context_manager.selected_contexts
            if not selected:
                return "当前未选择任何上下文"
            
            result = "✅ 当前选中的上下文:\n"
            for ctx_id in selected:
                ctx = advanced_context_manager.get_context(ctx_id)
                if ctx:
                    result += f"  • {ctx.id} - {ctx.name} ({ctx.type.value})\n"
            return result
        
        elif subcmd == "create" and len(parts) > 3:
            # /context create <name> <type>
            name = parts[2]
            type_str = parts[3]
            
            # 查找对应的ContextType
            context_type = None
            for ct in ContextType:
                if ct.value == type_str or ct.name.lower() == type_str.lower():
                    context_type = ct
                    break
            
            if not context_type:
                available_types = ", ".join([ct.value for ct in ContextType])
                return f"❌ 无效的上下文类型。可用类型: {available_types}"
            
            ctx_id = advanced_context_manager.create_context(name, context_type, "")
            return f"✅ 已创建上下文: {ctx_id}"
        
        elif subcmd == "delete" and len(parts) > 2:
            context_id = parts[2]
            if advanced_context_manager.delete_context(context_id):
                return f"✅ 已删除上下文: {context_id}"
            else:
                return f"❌ 上下文不存在: {context_id}"
        
        elif subcmd == "view" and len(parts) > 2:
            context_id = parts[2]
            ctx = advanced_context_manager.get_context(context_id)
            if ctx:
                content_preview = str(ctx.content)[:200] + "..." if len(str(ctx.content)) > 200 else str(ctx.content)
                return (
                    f"📄 上下文详情:\n"
                    f"  ID: {ctx.id}\n"
                    f"  名称: {ctx.name}\n"
                    f"  类型: {ctx.type.value}\n"
                    f"  创建时间: {ctx.created_at}\n"
                    f"  更新时间: {ctx.updated_at}\n"
                    f"  内容:\n{content_preview}"
                )
            else:
                return f"❌ 上下文不存在: {context_id}"
        
        elif subcmd == "types":
            result = "📋 支持的上下文类型:\n"
            for ct in ContextType:
                result += f"  • {ct.value} ({ct.name})\n"
            return result
        
        elif subcmd == "items" and len(parts) > 2:
            # /context items <context_id>
            context_id = parts[2]
            ctx = advanced_context_manager.get_context(context_id)
            if not ctx:
                return f"❌ 上下文不存在: {context_id}"
            
            items = advanced_context_manager.get_context_items(context_id)
            if not items:
                return f"📭 上下文 '{ctx.name}' 中没有条目"
            
            result = f"📋 上下文 '{ctx.name}' 中的条目 ({len(items)} 个):\n"
            for i, item in enumerate(items, 1):
                item_id = item.get("id", f"item_{i}")
                is_selected = "✅" if item_id in ctx.selected_items else "  "
                content_preview = str(item.get("content", ""))[:50]
                result += f"{is_selected} {i}. [{item_id}] {content_preview}...\n"
            return result
        
        elif subcmd == "item-select" and len(parts) > 3:
            # /context item-select <context_id> <item_id1> <item_id2> ...
            context_id = parts[2]
            item_ids = parts[3:]
            
            try:
                advanced_context_manager.select_context_items(context_id, item_ids)
                return f"✅ 已选择上下文 '{context_id}' 中的 {len(item_ids)} 个条目"
            except ValueError as e:
                return f"❌ {str(e)}"
        
        elif subcmd == "item-deselect" and len(parts) > 3:
            # /context item-deselect <context_id> <item_id1> <item_id2> ...
            context_id = parts[2]
            item_ids = parts[3:]
            
            try:
                advanced_context_manager.deselect_context_items(context_id, item_ids)
                return f"✅ 已取消选择上下文 '{context_id}' 中的 {len(item_ids)} 个条目"
            except ValueError as e:
                return f"❌ {str(e)}"
        
        elif subcmd == "item-clear" and len(parts) > 2:
            # /context item-clear <context_id>
            context_id = parts[2]
            
            try:
                advanced_context_manager.clear_context_item_selection(context_id)
                return f"✅ 已清空上下文 '{context_id}' 中的条目选择"
            except ValueError as e:
                return f"❌ {str(e)}"
        
        elif subcmd == "item-add" and len(parts) > 3:
            # /context item-add <context_id> <内容>
            context_id = parts[2]
            content = " ".join(parts[3:])
            
            try:
                item_id = advanced_context_manager.add_context_item(context_id, content)
                return f"✅ 已添加上下文条目: {item_id}"
            except ValueError as e:
                return f"❌ {str(e)}"
        
        elif subcmd == "item-delete" and len(parts) > 3:
            # /context item-delete <context_id> <item_id>
            context_id = parts[2]
            item_id = parts[3]
            
            try:
                success = advanced_context_manager.delete_context_item(context_id, item_id)
                if success:
                    return f"✅ 已删除上下文条目: {item_id}"
                else:
                    return f"❌ 上下文条目不存在: {item_id}"
            except ValueError as e:
                return f"❌ {str(e)}"
        
        elif subcmd == "item-view" and len(parts) > 3:
            # /context item-view <context_id> <item_id>
            context_id = parts[2]
            item_id = parts[3]
            
            item = advanced_context_manager.get_context_item(context_id, item_id)
            if not item:
                return f"❌ 上下文条目不存在: {item_id}"
            
            content = item.get("content", "")
            created_at = item.get("created_at", "")
            updated_at = item.get("updated_at", "")
            
            return (
                f"📄 上下文条目详情:\n"
                f"  上下文ID: {context_id}\n"
                f"  条目ID: {item_id}\n"
                f"  创建时间: {created_at}\n"
                f"  更新时间: {updated_at}\n"
                f"  内容:\n{content}"
            )
        
        else:
            return (
                f"未知子命令: {subcmd}\n"
                "可用命令:\n"
                "  /context list              - 列出所有上下文\n"
                "  /context select <id...>    - 选择多个上下文\n"
                "  /context deselect <id...>  - 取消选择上下文\n"
                "  /context selected          - 显示当前选中的上下文\n"
                "  /context create <name> <type> - 创建新上下文\n"
                "  /context delete <id>       - 删除上下文\n"
                "  /context view <id>         - 查看上下文详情\n"
                "  /context types             - 显示支持的上下文类型\n"
                "\n📝 条目级别操作:\n"
                "  /context items <id>        - 列出上下文中的所有条目\n"
                "  /context item-select <ctx_id> <item_id...> - 选择上下文中的特定条目\n"
                "  /context item-deselect <ctx_id> <item_id...> - 取消选择上下文中的条目\n"
                "  /context item-clear <ctx_id> - 清空上下文中的条目选择\n"
                "  /context item-add <ctx_id> <内容> - 添加上下文条目\n"
                "  /context item-delete <ctx_id> <item_id> - 删除上下文条目\n"
                "  /context item-view <ctx_id> <item_id> - 查看上下文条目详情\n"
            )
    
    elif cmd == "/help":
        return (
            "📖 可用命令:\n"
            "  /context list              - 列出所有上下文\n"
            "  /context select <id...>    - 选择多个上下文（多选）\n"
            "  /context deselect <id...>  - 取消选择上下文\n"
            "  /context selected          - 显示当前选中的上下文\n"
            "  /context create <name> <type> - 创建新上下文\n"
            "  /context delete <id>       - 删除上下文\n"
            "  /context view <id>         - 查看上下文详情\n"
            "  /context types             - 显示支持的上下文类型\n"
            "\n📝 条目级别操作:\n"
            "  /context items <id>        - 列出上下文中的所有条目\n"
            "  /context item-select <ctx_id> <item_id...> - 选择上下文中的特定条目\n"
            "  /context item-deselect <ctx_id> <item_id...> - 取消选择上下文中的条目\n"
            "  /context item-clear <ctx_id> - 清空上下文中的条目选择\n"
            "  /context item-add <ctx_id> <内容> - 添加上下文条目\n"
            "  /context item-delete <ctx_id> <item_id> - 删除上下文条目\n"
            "  /context item-view <ctx_id> <item_id> - 查看上下文条目详情\n"
            "\n💾 保存命令:\n"
            "  /save <内容>               - 保存内容到上下文（显示菜单）\n"
            "  /save --type=<类型> <内容> - 直接保存到指定类型上下文\n"
            "\n❓ 其他命令:\n"
            "  /help                      - 显示此帮助信息\n"
            "  /exit 或 退出              - 退出程序\n"
            "\n💡 使用说明:\n"
            "  1. 使用 /context create 创建需要的上下文类型，或直接使用/save自动创建\n"
            "  2. 使用 /context select 选择要使用的上下文（可多选）\n"
            "  3. 使用 /context items 查看上下文中的条目\n"
            "  4. 使用 /context item-select 选择上下文中的特定条目\n"
            "  5. 提问时，系统会自动使用选中的上下文和条目\n"
            "  6. AI回复后，可以选择保存到特定上下文\n"
            "  7. 使用 /save --type=novel 内容 直接保存到小说上下文\n"
            "\n📝 支持的上下文类型:\n"
            "  • 小说数据 (NOVEL) - 存储小说相关数据\n"
            "  • 人物设定 (CHARACTER) - 角色设定\n"
            "  • 世界设定 (WORLD) - 世界观设定\n"
            "  • 作品大纲 (OUTLINE) - 故事大纲\n"
            "  • 事件细纲 (EVENTS) - 事件详情\n"
            "  • 会话历史 (HISTORY) - 对话历史记录\n"
            "  • 自定义 (CUSTOM) - 自定义类型\n"
        )
    
    elif cmd == "/save" and len(parts) > 1:
        # 检查是否包含--type参数
        full_command = command.strip()
        if "--type=" in full_command:
            # 解析--type参数
            import re
            match = re.search(r'--type=(\S+)', full_command)
            if match:
                context_type_str = match.group(1)
                # 移除--type参数部分获取内容
                content = re.sub(r'--type=\S+\s*', '', full_command).replace('/save ', '', 1).strip()
                
                if not content:
                    return "❌ 请提供要保存的内容"
                
                # 查找对应的ContextType
                context_type = None
                for ct in ContextType:
                    if ct.value == context_type_str or ct.name.lower() == context_type_str.lower():
                        context_type = ct
                        break
                
                if not context_type:
                    available_types = ", ".join([ct.value for ct in ContextType])
                    return f"❌ 无效的上下文类型。可用类型: {available_types}"
                
                # 查找或创建指定类型的上下文
                contexts_of_type = advanced_context_manager.get_contexts_by_type(context_type)
                if contexts_of_type:
                    # 保存到第一个该类型的上下文
                    context_id = contexts_of_type[0].id
                    advanced_context_manager.save_to_context(context_id, content, append=True)
                    return f"✅ 已保存到 {context_type.value} 上下文: {contexts_of_type[0].name}"
                else:
                    # 创建新的上下文
                    name = f"新建{context_type.value}"
                    ctx_id = advanced_context_manager.create_context(
                        name=name,
                        context_type=context_type,
                        content=content
                    )
                    return f"✅ 已创建并保存到新 {context_type.value} 上下文: {name} ({ctx_id})"
            else:
                return "❌ 无效的--type参数格式。正确格式: --type=<类型>"
        else:
            # 原来的处理方式：显示保存菜单
            content = " ".join(parts[1:])
            result = show_save_menu(content)
            return f"保存结果: {result}"
    
    return f"未知命令: {cmd}。输入 /help 查看可用命令。"


if __name__ == "__main__":
    print("=" * 60)
    print("🤖 多上下文智能体 | 支持多选、多种上下文类型")
    print("=" * 60)
    print("📚 历史记录: 已禁用（每次都是新的对话）")
    print(f"📋 上下文总数: {len(advanced_context_manager.contexts)} 个")
    
    selected_content = get_selected_contexts_content()
    if selected_content != "【未选择任何上下文】":
        print(f"✅ 当前选中上下文: {len(advanced_context_manager.selected_contexts)} 个")
        print(f"📄 选中内容预览: {selected_content[:100]}...")
    else:
        print("⚠️  未选择任何上下文，AI将无法访问上下文信息")
    
    print("\n💡 输入 /help 查看所有命令")
    print("-" * 60)
    
    while True:
        q = input("\n❓ 问题/命令: ").strip()
        if not q or q.lower() in ["退出", "quit", "exit"]:
            print("\n🔒 会话结束 | 所有上下文已自动保存")
            break
        
        # 检查是否是命令
        if q.startswith("/"):
            result = handle_context_command(q)
            print(f"\n{result}")
            continue
        
        try:
            # 1. 获取选中上下文内容
            selected_contexts_content = get_selected_contexts_content()
            
            # 2. 创建动态系统提示（包含上下文）
            from prompt import get_system_prompt
            system_prompt_message = get_system_prompt(selected_contexts_content)
            
            # 3. 创建用户消息
            user_message = HumanMessage(content=q)
            
            # 4. 构建消息列表：系统提示 + 用户消息
            all_messages = [system_prompt_message, user_message]
            
            input_data = {
                "messages": all_messages
            }
            
            print("\n🤖 正在分析...（内容实时生成中）")
            print("─" * 50)
            full_response = ""
            
            # 5. 流式处理
            for event in agent.stream(input_data, stream_mode="messages"):
                msg = event[0]  # LangChain 消息对象
                
                # 处理工具调用
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    # 处理小说工具调用
                    for tc in msg.tool_calls:
                        if tc.get("name") == "novel_tool":
                            # 小说工具调用，继续处理
                            continue
                    continue
                
                # 处理工具响应
                if hasattr(msg, 'type') and msg.type == 'tool':
                    # 处理小说工具响应
                    if getattr(msg, 'name', '') == 'novel_tool':
                        try:
                            tool_data = json.loads(str(msg.content))
                            if tool_data.get("status") == "success" and "data" in tool_data:
                                # 保存小说数据到上下文
                                novel_data = tool_data["data"]
                                # 查找或创建小说上下文
                                novel_contexts = advanced_context_manager.get_contexts_by_type(
                                    ContextType.NOVEL
                                )
                                if novel_contexts:
                                    # 保存到第一个小说上下文
                                    context_id = novel_contexts[0].id
                                    advanced_context_manager.save_to_context(
                                        context_id, 
                                        novel_data,
                                        append=False
                                    )
                                    print(f"\n📚 小说数据已保存到上下文: {context_id}")
                                else:
                                    # 创建新的小说上下文
                                    context_id = advanced_context_manager.create_context(
                                        name="小说数据",
                                        context_type=ContextType.NOVEL,
                                        content=novel_data
                                    )
                                    print(f"\n📚 小说数据已保存到新上下文: {context_id}")
                        except Exception as e:
                            print(f"\n[⚠️] 小说数据解析失败: {str(e)[:50]}", file=sys.stderr)
                    continue
                
                # 处理最终回复
                if hasattr(msg, 'content') and msg.content:
                    clean = (
                        str(msg.content)
                        .replace('\u200b', '')
                        .replace('\uff0c', ',')
                        .replace('\xa0', ' ')
                        .replace('\u3000', ' ')
                    )
                    if clean:
                        print(clean, end="", flush=True)
                        full_response += clean
            
            # 6. 询问用户是否保存到特定上下文
            if full_response.strip():
                print("\n" + "─" * 50)
                save_result = show_save_menu(full_response)
                print(f"\n💾 {save_result}")
            
            print("\n" + "─" * 50)
            print("✅ 回答完成")
            
        except Exception as e:
            print(e)
