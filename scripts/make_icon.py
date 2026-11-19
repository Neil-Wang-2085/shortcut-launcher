from PIL import Image, ImageDraw
import os


def make(size: int) -> Image.Image:
    k = size / 128.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6 * k, 6 * k, 122 * k, 122 * k], radius=28 * k, fill=(43, 95, 168, 255))
    d.ellipse([30 * k, 30 * k, 80 * k, 80 * k], outline=(255, 255, 255, 255), width=max(1, int(7 * k)))
    d.line([73 * k, 73 * k, 100 * k, 100 * k], fill=(255, 255, 255, 255), width=max(1, int(9 * k)))
    return img


os.makedirs("assets", exist_ok=True)
os.makedirs("build", exist_ok=True)

make(32).save("assets/icon.png")
big = make(256)
big.save("build/icon.png")
big.save("build/icon.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("icons written")
