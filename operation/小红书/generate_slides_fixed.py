#!/usr/bin/env python3
"""生成小红书系列配图 - 聊天总是聊死 (修复版)"""

from PIL import Image, ImageDraw, ImageFont
import os

# 尺寸（3:4竖版）
WIDTH = 1080
HEIGHT = 1440

# 统一配色
COLORS = {
    'red': (255, 59, 48),
    'green': (52, 199, 89),
    'white': (255, 255, 255),
    'gray': (142, 142, 147),
    'dark': (28, 28, 30),
    'accent': (255, 189, 46),
}

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

def load_font(size, bold=True):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
    except:
        return ImageFont.load_default()

def draw_centered_text(draw, text, y, font, color):
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, y), text, fill=color, font=font)

def create_bg(dark=False):
    if dark:
        return Image.new("RGB", (WIDTH, HEIGHT), COLORS['dark'])
    return Image.new("RGB", (WIDTH, HEIGHT), (250, 250, 250))

def generate_cover():
    """01_封面 - 去掉问号，改成有意义的视觉元素"""
    bg = create_bg(dark=True)
    draw = ImageDraw.Draw(bg)

    # 顶部强调条
    draw.rectangle([0, 0, WIDTH, 120], fill=COLORS['red'])

    # 主标题
    font_90 = load_font(100, bold=True)
    draw_centered_text(draw, "90%的人", 200, font_90, COLORS['white'])

    font_title = load_font(130, bold=True)
    draw_centered_text(draw, "聊天聊死", 350, font_title, COLORS['red'])

    font_sub = load_font(60, bold=True)
    draw_centered_text(draw, "因为这3句话", 530, font_sub, COLORS['white'])

    # 装饰线
    draw.rectangle([(WIDTH - 300) // 2, 640, (WIDTH + 300) // 2, 645], fill=COLORS['red'])

    # 中间区域：用3个小圆点代替问号，表示"3句话"
    y_dot = 800
    dot_spacing = 60
    for i in range(3):
        x_dot = WIDTH // 2 + (i - 1) * dot_spacing
        draw.ellipse([x_dot - 15, y_dot - 15, x_dot + 15, y_dot + 15], fill=COLORS['red'])

    # 底部金句
    draw.rectangle([0, HEIGHT - 200, WIDTH, HEIGHT], fill=(20, 20, 20))
    font_bottom = load_font(50, bold=True)
    draw_centered_text(draw, "王者从不这样回", HEIGHT - 160, font_bottom, COLORS['green'])
    font_cta = load_font(28)
    draw_centered_text(draw, "收藏起来，聊天直接用", HEIGHT - 100, font_cta, COLORS['gray'])

    bg.save(f"{OUTPUT_DIR}/01_封面.png", "PNG", quality=95)
    print("✅ 01_封面.png (修复版)")

def generate_scene():
    """02_场景钩子"""
    bg = create_bg()
    draw = ImageDraw.Draw(bg)

    draw.rectangle([0, 0, WIDTH, 100], fill=COLORS['dark'])
    font_title = load_font(45, bold=True)
    draw_centered_text(draw, "你是不是也这样聊死过？", 30, font_title, COLORS['white'])

    scenarios = [
        ("❌ 坑1", "查户口式提问", "在干嘛？吃了吗？睡了吗？"),
        ("❌ 坑2", "秒回症晚期", "对方回一句，你回十句"),
        ("❌ 坑3", "假性聊天", "每天早安晚安，毫无推进"),
    ]

    y_start = 180
    card_h = 350

    for i, (title, subtitle, desc) in enumerate(scenarios):
        y = y_start + i * card_h
        draw.rectangle([50, y, WIDTH - 50, y + card_h - 40], fill=(240, 240, 240))
        draw.rectangle([50, y, 70, y + card_h - 40], fill=COLORS['red'])

        font_card = load_font(40, bold=True)
        draw.text((100, y + 30), title, fill=COLORS['red'], font=font_card)

        font_sub = load_font(35)
        draw.text((100, y + 90), subtitle, fill=COLORS['dark'], font=font_sub)

        font_desc = load_font(30)
        draw.text((100, y + 150), desc, fill=(100, 100, 100), font=font_desc)

    font_bottom = load_font(45, bold=True)
    draw_centered_text(draw, "想改变？往下看", HEIGHT - 80, font_bottom, COLORS['red'])

    bg.save(f"{OUTPUT_DIR}/02_场景钩子.png", "PNG", quality=95)
    print("✅ 02_场景钩子.png")

def generate_pit(pit_num, pit_name, bronze, gold, why_bad, why_good):
    """03-05_坑模板 - 修复✅❌符号"""
    bg = create_bg()
    draw = ImageDraw.Draw(bg)

    # 顶部标签
    draw.rectangle([0, 0, 200, 60], fill=COLORS['red'])
    font_tag = load_font(30, bold=True)
    draw.text((20, 15), f"坑{pit_num}", fill=COLORS['white'], font=font_tag)

    # 坑名称
    font_pit = load_font(55, bold=True)
    draw_centered_text(draw, pit_name, 100, font_pit, COLORS['dark'])
    draw.rectangle([(WIDTH - 400) // 2, 180, (WIDTH + 400) // 2, 185], fill=COLORS['red'])

    # 青铜区 - 用❌
    y青铜 = 230
    draw.rectangle([40, y青铜, WIDTH - 40, y青铜 + 200], fill=(255, 240, 240))
    draw.rectangle([40, y青铜, 60, y青铜 + 200], fill=COLORS['red'])

    font_label = load_font(35, bold=True)
    draw.text((80, y青铜 + 20), "❌ 青铜操作", fill=COLORS['red'], font=font_label)

    font_bronze = load_font(32)
    draw.text((80, y青铜 + 80), bronze, fill=(80, 80, 80), font=font_bronze)

    # 王者区 - 用✅
    y王者 = 480
    draw.rectangle([40, y王者, WIDTH - 40, y王者 + 200], fill=(240, 255, 240))
    draw.rectangle([40, y王者, 60, y王者 + 200], fill=COLORS['green'])

    font_label = load_font(35, bold=True)
    draw.text((80, y王者 + 20), "✅ 王者操作", fill=COLORS['green'], font=font_label)

    font_gold = load_font(32)
    draw.text((80, y王者 + 80), gold, fill=COLORS['dark'], font=font_gold)

    # 思维提炼
    y思维 = 730
    draw.rectangle([40, y思维, WIDTH - 40, y思维 + 280], fill=(245, 245, 245))

    font_think = load_font(32, bold=True)
    draw.text((60, y思维 + 20), "💡 思维提炼", fill=COLORS['dark'], font=font_think)

    font_why = load_font(26)
    draw.text((60, y思维 + 80), why_bad, fill=COLORS['red'], font=font_why)
    draw.text((60, y思维 + 150), why_good, fill=COLORS['green'], font=font_why)

    font_bottom = load_font(28)
    draw_centered_text(draw, "收藏起来，下次避免踩坑", HEIGHT - 60, font_bottom, COLORS['gray'])

    bg.save(f"{OUTPUT_DIR}/0{pit_num}_坑{pit_num}_{pit_name}.png", "PNG", quality=95)
    print(f"✅ 0{pit_num}_坑{pit_num}_{pit_name}.png")

def generate_pushpull():
    """06_推拉连招"""
    bg = create_bg()
    draw = ImageDraw.Draw(bg)

    draw.rectangle([0, 0, WIDTH, 100], fill=COLORS['green'])
    font_title = load_font(45, bold=True)
    draw_centered_text(draw, "情绪波动神器：推拉连招", 30, font_title, COLORS['white'])

    y = 160

    draw.rectangle([60, y, WIDTH - 60, y + 150], fill=(255, 240, 240))
    font_formula = load_font(50, bold=True)
    draw.text((100, y + 40), "推：", fill=COLORS['red'], font=font_formula)
    draw.text((200, y + 40), "你先嫌弃她一下", fill=COLORS['dark'], font=font_formula)
    font_ex = load_font(28)
    draw.text((100, y + 100), '例："你怎么这么笨"', fill=(120, 120, 120), font=font_ex)

    y += 200

    draw.rectangle([60, y, WIDTH - 60, y + 150], fill=(240, 255, 240))
    draw.text((100, y + 40), "拉：", fill=COLORS['green'], font=font_formula)
    draw.text((200, y + 40), "再给她一个甜枣", fill=COLORS['dark'], font=font_formula)
    draw.text((100, y + 100), '例："但笨蛋很可爱啊"', fill=(120, 120, 120), font=font_ex)

    y += 200

    draw.rectangle([60, y, WIDTH - 60, y + 150], fill=(255, 255, 200))
    font_result = load_font(35, bold=True)
    draw_centered_text(draw, "效果：让她哭笑不得，越来越上头", y + 50, font_result, COLORS['dark'])

    draw.rectangle([0, HEIGHT - 150, WIDTH, HEIGHT], fill=COLORS['dark'])
    font_bottom = load_font(40, bold=True)
    draw_centered_text(draw, "学会这招，聊天不再平淡", HEIGHT - 100, font_bottom, COLORS['green'])

    bg.save(f"{OUTPUT_DIR}/06_推拉连招.png", "PNG", quality=95)
    print("✅ 06_推拉连招.png")

def generate_cta():
    """07_万能公式_CTA"""
    bg = create_bg(dark=True)
    draw = ImageDraw.Draw(bg)

    draw.rectangle([0, 0, WIDTH, 120], fill=COLORS['green'])
    font_top = load_font(50, bold=True)
    draw_centered_text(draw, "📌 万能回复公式", 40, font_top, COLORS['white'])

    font_formula = load_font(48, bold=True)
    formulas = [
        ("公式1", "状态 + 好奇 → 引发回复"),
        ("公式2", "推拉 + 情绪 → 制造波动"),
        ("公式3", "筛选 + 台阶 → 推进关系"),
    ]

    y = 200
    for title, content in formulas:
        draw.rectangle([60, y, WIDTH - 60, y + 100], fill=(40, 40, 40))
        draw.rectangle([60, y, 80, y + 100], fill=COLORS['green'])
        font_f = load_font(36, bold=True)
        draw.text((100, y + 25), title, fill=COLORS['green'], font=font_f)
        draw.text((280, y + 25), content, fill=COLORS['white'], font=font_f)
        y += 130

    y = 620
    draw.rectangle([60, y, WIDTH - 60, y + 180], fill=(60, 60, 60))
    font_q = load_font(40, bold=True)
    draw_centered_text(draw, "你在聊天中踩过哪个坑？", y + 30, font_q, COLORS['white'])
    font_hint = load_font(28)
    draw_centered_text(draw, "评论区说说，帮你分析", y + 100, font_hint, COLORS['gray'])

    draw.rectangle([0, HEIGHT - 180, WIDTH, HEIGHT], fill=COLORS['dark'])
    font_collect = load_font(42, bold=True)
    draw_centered_text(draw, "收藏起来，聊天时对照用", HEIGHT - 130, font_collect, COLORS['white'])

    font_action = load_font(30)
    draw_centered_text(draw, '👍 点赞 + 评论"思维" 领完整版', HEIGHT - 70, font_action, COLORS['green'])

    bg.save(f"{OUTPUT_DIR}/07_万能公式_CTA.png", "PNG", quality=95)
    print("✅ 07_万能公式_CTA.png")

OUTPUT_DIR = "/home/admin/zhuiai/operation/小红书/幻灯片/聊天总是聊死"

if __name__ == "__main__":
    print("生成修复版配图...")

    generate_cover()
    generate_scene()

    generate_pit(
        1, "查户口",
        "在干嘛？吃了吗？睡了吗？工作累吗？",
        "对最近的话题发表评论，不直接提问",
        "不断提问会让人有压力，像审讯",
        "用评论代替提问，对方更愿意回应"
    )

    generate_pit(
        2, "秒回症",
        "对方回一句，立刻秒回，还回很多",
        "等3-5分钟再回，控制回复节奏",
        "秒回显得你太闲，需求感暴露",
        "适当延迟展现价值和选择权"
    )

    generate_pit(
        3, "假性聊天",
        "每天早安晚安，聊天很规律但没推进",
        "聊到高潮时主动结束，留下悬念",
        "聊天变成习惯但不产生暧昧",
        "在情绪高点结束，对方会更期待"
    )

    generate_pushpull()
    generate_cta()

    print("\n✅ 修复版配图完成！")