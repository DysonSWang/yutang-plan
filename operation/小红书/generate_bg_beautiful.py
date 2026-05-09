#!/usr/bin/env python3
"""用MiniMax图生图美化封面背景"""

import requests
import os

API_KEY = os.environ.get("MINIMAX_API_KEY", "")
OUTPUT_DIR = "/home/admin/zhuiai/operation/小红书/幻灯片/聊天总是聊死"

def generate_bg():
    """生成美化背景图"""
    url = "https://api.minimaxi.com/v1/image_generation"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # 更精确的prompt，避免文字问题，专注于背景和氛围
    prompt = """
    A vertical 3:4 phone screen mockup showing WeChat conversation.
    Guy sends "在干嘛?" and gets cold reply "没什么".
    Blurred background of cozy cafe with warm bokeh lights.
    Dark moody atmosphere, cinematic lighting, high contrast.
    Top area has empty space for text overlay.
    Style: minimalist, photorealistic, warm moody tones.
    No text or symbols, just the visual scene.
    """

    data = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": "3:4",
        "response_format": "url",
        "n": 1
    }

    print("生成美化背景...")
    response = requests.post(url, headers=headers, json=data, timeout=180)

    if response.status_code == 200:
        result = response.json()
        if result.get("data") and result["data"].get("image_urls"):
            image_url = result["data"]["image_urls"][0]
            img_response = requests.get(image_url, timeout=120)
            if img_response.status_code == 200:
                bg_path = f"{OUTPUT_DIR}/bg_beautiful.png"
                with open(bg_path, 'wb') as f:
                    f.write(img_response.content)
                print(f"✅ 背景图已保存: {bg_path}")
                return bg_path

    print(f"❌ 错误: {response.status_code} - {response.text}")
    return None

if __name__ == "__main__":
    bg_path = generate_bg()
    if bg_path:
        print(f"\n背景图路径: {bg_path}")