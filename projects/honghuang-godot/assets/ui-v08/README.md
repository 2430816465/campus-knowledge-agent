# V0.8 首页美术来源

2026-10-07，通过当前会话内置 image_gen 图像工具生成，用于用户授权的正式游戏 UI 首页。

## 参考依据

用户提供并确认可按其制作的 `C:/Users/24308/Downloads/洪荒仙府炼器界面.png`。仅参考最新确认的仙府场景和图标布局。本批未使用已经废弃的 `xianfu-background-v02.webp`。

## 文件

- `home-immortal.png`：941×1672，RGB。青蓝仙府、宫阙、树木、水流、白龙与坐姿男性仙人；不含游戏文字、数值、按钮。实际文字与数据由 Godot 原生控件绘制。
- `illustrated-icons.png`：1254×1254，RGBA。6×6 等分图标图集，透明底；活动、培养、装备、资源、底部导航使用独立裁切区域。由 `GameIllustratedIcon.texture()` 读取导入纹理并创建 AtlasTexture。
- `panel-paper.svg`、`panel-jade.svg`、`button-jade.svg`、`button-gold.svg`：本作代码生成的基础界面框架，由主任务维护。

## 图集顺序

1. chest / gift / events / friends / beast / treasure
2. meditation / guild / battle / hunt / tower / festival
3. checkin / summon / sword / mirror / armor / gourd
4. fire / lotus / fan / crown / taiji / bracelet
5. pendant / bell / seal / boots / scroll / stone
6. xp / ingot / forge / estate / adventure / rank

## 生成方向

首页背景：依据最新用户参考图，精细东方仙侠手游二维插画，青蓝宫阙与树木、仙府水景、白龙和沉静的坐姿男性仙人，保留顶部活动图标空间与底部数据界面空间；不生成任何文字、边框、按钮或数字。

图标图集：统一精细手绘二维仙侠手游风格，独立物件与人物小头像，金属金色、高饱和青玉、少量朱红；6×6 等分布局，每格图标居中且互不重叠，透明底，无文字，无矩形图标卡框。

图像生成原始输出目录：`C:/Users/24308/.codex/generated_images/01a1131a-1f09-7b93-bf3d-1f9c77ca87de/`；已复制完整图像到本目录，运行和导出均不依赖外部路径。
