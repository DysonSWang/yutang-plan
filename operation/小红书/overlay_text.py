#!/usr/bin/env python3
"""生成最终版封面 - 叠加文字到美化背景上"""

from PIL import Image, ImageDraw, ImageFont
import os

WIDTH = 1080
HEIGHT = 1440
OUTPUT_DIR = "/home/admin/zhuiai/operation/小红书/幻灯片/聊天总是聊死"

COLORS = {
    'red': (255, 59, 48),
    'green': (52, 199, 89),
    'white': (255, 255, 255),
    'gray': (142, 142, 147),
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

def create_final_cover():
    """叠加文字到美化背景"""
    # 打开美化背景
    bg_path = f"{OUTPUT_DIR}/bg_beautiful.png"
    bg = Image.open(bg_path).convert("RGB")

    # 调整到目标尺寸
    bg = bg.resize((WIDTH, HEIGHT), Image.LANCZOS)

    # 添加渐变遮罩（让下半部分稍微暗一些，突出文字）
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_overlay = ImageDraw.Draw(overlay)

    # 从中间向下渐变
    for y in range(HEIGHT // 2, HEIGHT):
        alpha = int(80 * (y - HEIGHT // 2) / (HEIGHT // 2))
        draw_overlay.line([(0, y), (WIDTH, y)], fill=(0, 0, 0, alpha))

    bg = Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGB")

    # 绘制文字
    draw = ImageDraw.Draw(bg)

    # 顶部红色条
    draw.rectangle([0, 0, WIDTH, 100], fill=COLORS['red'])

    # 主标题 - 90%的人
    font_90 = load_font(90, bold=True)
    draw_centered_text(draw, "90%的人", 160, font_90, COLORS['white'])

    # 核心痛点 - 聊天聊死
    font_title = load_font(120, bold=True)
    draw_centered_text(draw, "聊天聊死", 280, font_title, COLORS['red'])

    # 副标题
    font_sub = load_font(50, bold=True)
    draw_centered_text(draw, "因为这3句话", 440, font_sub, COLORS['white'])

    # 装饰线
    draw.rectangle([(WIDTH - 280) // 2, 530, (WIDTH + 280) // 2, 535], fill=COLORS['red'])

    # 底部金句区域
    draw.rectangle([0, HEIGHT - 180, WIDTH, HEIGHT], fill=(0, 0, 0, 120))

    font_bottom = load_font(45, bold=True)
    draw_centered_text(draw, "王者从不这样回", HEIGHT - 140, font_bottom, COLORS['green'])

    font_cta = load_font(26)
    draw_centered_text(draw, "收藏起来，聊天直接用", HEIGHT - 80, font_cta, COLORS['gray'])

    # 保存
    bg.save(f"{OUTPUT_DIR}/01_封面_final.png", "PNG", quality=95)
    print(f"✅ 01_封面_final.png")

    # 同时保存为正式版
    bg.save(f"{OUTPUT_DIR}/01_封面.png", "PNG", quality=95)
    print(f"✅ 01_封面.png (更新)")

if __name__ == "__main__":
    create_final_cover()