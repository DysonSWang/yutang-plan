#!/usr/bin/env python3
"""生成小红书封面 - 聊天总是聊死"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# 封面尺寸（3:4）
WIDTH = 1080
HEIGHT = 1440

# 颜色
TEXT_COLOR = (255, 255, 255)  # 白色文字
ACCENT_COLOR = (255, 59, 48)  # 暖红色
SUBTEXT_COLOR = (255, 255, 255)  # 白色副标题
TAG_COLOR = (200, 200, 200)  # 灰色标签
DARK_OVERLAY = (0, 0, 0, 140)  # 半透明黑色

# 字体路径
FONT_PATH_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_PATH_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

def load_font(size, bold=False):
    """加载字体"""
    try:
        if bold:
            return ImageFont.truetype(FONT_PATH_BOLD, size)
        return ImageFont.truetype(FONT_PATH_REGULAR, size)
    except:
        return ImageFont.load_default()

def create_cover(output_path: str):
    """生成聊天总是聊死封面"""
    # 背景图
    bg_path = "/home/admin/zhuiai/operation/小红书/形象照.jpg"
    bg = Image.open(bg_path).convert("RGB")

    # 裁剪为3:4比例（居中裁剪）
    bg_width, bg_height = bg.size
    target_ratio = WIDTH / HEIGHT  # 0.75
    current_ratio = bg_width / bg_height

    if current_ratio > target_ratio:
        # 图片太宽，左右裁剪
        new_width = int(bg_height * target_ratio)
        left = (bg_width - new_width) // 2
        bg = bg.crop((left, 0, left + new_width, bg_height))
    else:
        # 图片太高，上下裁剪
        new_height = int(bg_width / target_ratio)
        top = (bg_height - new_height) // 2
        bg = bg.crop((0, top, bg_width, top + new_height))

    # 缩放到目标尺寸
    bg = bg.resize((WIDTH, HEIGHT), Image.LANCZOS)

    # 添加模糊效果增加质感
    bg = bg.filter(ImageFilter.GaussianBlur(radius=3))

    # 添加渐变遮罩（从中间向下渐变变暗）
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_overlay = ImageDraw.Draw(overlay)

    # 上半部分：文字区域，淡遮罩
    for y in range(0, int(HEIGHT * 0.55)):
        alpha = int(30 * (y / (HEIGHT * 0.55)))
        draw_overlay.line([(0, y), (WIDTH, y)], fill=(0, 0, 0, alpha))

    # 下半部分：图片区域，渐变遮罩
    gradient_start = int(HEIGHT * 0.55)
    for y in range(gradient_start, HEIGHT):
        progress = (y - gradient_start) / (HEIGHT - gradient_start)
        alpha = int(60 + 100 * progress)
        draw_overlay.line([(0, y), (WIDTH, y)], fill=(0, 0, 0, alpha))

    bg = Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGB")

    # 绘制文字
    draw = ImageDraw.Draw(bg)

    # ========== 顶部区域 ==========

    # 主标题：第一行 "90%的人"
    font_90 = load_font(100, bold=True)
    text_90 = "90%的人"
    bbox = draw.textbbox((0, 0), text_90, font=font_90)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, 280), text_90, fill=TEXT_COLOR, font=font_90)

    # 主标题：第二行 "聊天聊死"
    font_title = load_font(130, bold=True)
    text_title = "聊天聊死"
    bbox = draw.textbbox((0, 0), text_title, font=font_title)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, 400), text_title, fill=ACCENT_COLOR, font=font_title)

    # 副标题 "因为这3句话"
    font_sub = load_font(55, bold=True)
    text_sub = "因为这3句话"
    bbox = draw.textbbox((0, 0), text_sub, font=font_sub)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, 560), text_sub, fill=TEXT_COLOR, font=font_sub)

    # ========== 中间装饰 ==========

    # 红色强调线
    line_y = 680
    line_width = 200
    draw.rectangle([(WIDTH - line_width) // 2, line_y, (WIDTH + line_width) // 2, line_y + 4], fill=ACCENT_COLOR)

    # ========== 底部区域 ==========

    # 底部金句背景
    bottom_y = 1150
    draw.rectangle([0, bottom_y, WIDTH, HEIGHT], fill=(0, 0, 0, 100))

    # 金句文字 "王者从不这样回"
    font_bottom = load_font(45, bold=True)
    text_bottom = "王者从不这样回"
    bbox = draw.textbbox((0, 0), text_bottom, font=font_bottom)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, bottom_y + 80), text_bottom, fill=TEXT_COLOR, font=font_bottom)

    # CTA文字
    font_cta = load_font(28)
    text_cta = "建议收藏，聊天直接用"
    bbox = draw.textbbox((0, 0), text_cta, font=font_cta)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, bottom_y + 150), text_cta, fill=TAG_COLOR, font=font_cta)

    # 保存
    bg.save(output_path, "PNG", quality=95)
    print(f"✅ 封面已生成: {output_path}")

if __name__ == "__main__":
    output_path = "/home/admin/zhuiai/operation/小红书/幻灯片/聊天总是聊死/01_封面_v3.png"
    create_cover(output_path)