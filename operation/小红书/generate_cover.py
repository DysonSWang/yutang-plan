#!/usr/bin/env python3
"""生成小红书封面 - 优化版「聊天总是聊死」"""

import requests
import os

API_KEY = os.environ.get("MINIMAX_API_KEY", "")
OUTPUT_DIR = "/home/admin/zhuiai/operation/小红书/幻灯片/聊天总是聊死"

def generate_image(prompt: str, output_path: str):
    """使用MiniMax image-01生成图片"""
    url = "https://api.minimaxi.com/v1/image_generation"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": "3:4",
        "response_format": "url",
        "n": 1
    }

    print(f"生成中: {output_path}")
    response = requests.post(url, headers=headers, json=data, timeout=180)

    if response.status_code == 200:
        result = response.json()
        if result.get("data") and result["data"].get("image_urls"):
            image_url = result["data"]["image_urls"][0]
            # 下载图片
            img_response = requests.get(image_url, timeout=120)
            if img_response.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(img_response.content)
                print(f"✅ 保存至: {output_path}")
                return True

    print(f"❌ 错误: {response.status_code} - {response.text}")
    return False

# 优化封面 prompt - 加入聊天记录底纹+暖色背景，更有"人感"
cover_prompt = """
A vertical 3:4 mobile phone screenshot showing WeChat chat interface.
The chat shows a failed conversation: Guy sends "在干嘛?" and gets a cold "没什么" reply.
Background: blurred warm cafe scene with soft bokeh lights, cozy and relatable.
Overlay large bold Chinese text at top: "90%的人" in white, "聊天聊死" in bright red, "因为这3句话" in white.
Bottom area shows a green checkmark icon with text "王者从不这样回".
Style: Minimalist, bold typography, mobile screenshot aesthetic, warm tones, high contrast.
Text should be prominent and easily readable on mobile.
"""

success = generate_image(cover_prompt, f"{OUTPUT_DIR}/01_封面_v2.png")

if success:
    print(f"\n封面生成完成!")
else:
    print("生成失败")