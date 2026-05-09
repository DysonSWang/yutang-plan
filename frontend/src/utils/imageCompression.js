/**
 * 前端图片压缩工具
 * 目标：最长边 1920px、JPEG 80%、输出 < 800KB
 */

/**
 * 压缩图片文件
 * @param {File} file - 原始图片文件
 * @param {Object} options - 配置
 * @returns {Promise<Blob>} 压缩后的 Blob
 */
export async function compressImage(file, options = {}) {
  const maxWidth = options.maxWidth || 1920;
  const quality = options.quality || 0.8;
  const targetSize = options.targetSize || 800 * 1024; // 800KB

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 计算压缩尺寸
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        // 绘制到 canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 压缩到目标大小
        let currentQuality = quality;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('压缩失败'));
                return;
              }
              // 如果仍然太大，降低质量再试
              if (blob.size > targetSize && currentQuality > 0.3) {
                currentQuality -= 0.15;
                canvas.toBlob(
                  (blob2) => {
                    if (blob2) resolve(blob2);
                    else reject(new Error('压缩失败'));
                  },
                  'image/jpeg',
                  currentQuality
                );
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            currentQuality
          );
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 创建压缩后的 File 对象（保留原始文件名）
 */
export async function compressImageFile(file, options = {}) {
  const blob = await compressImage(file, options);
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}
