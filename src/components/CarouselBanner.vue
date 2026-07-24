<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

/**
 * CarouselBanner - 轮播图组件
 *
 * 3-4张轮播图，自动播放（间隔5秒），支持手动左右切换
 * 底部指示点，鼠标悬停暂停自动播放
 * 点击轮播图可跳转到对应的详情页
 *
 * 轮播图图片说明：
 * - banner-1.jpg：党建宣传主图，建议尺寸 1400x400px
 * - banner-2.jpg：党建活动图，建议尺寸 1400x400px
 * - banner-3.jpg：学习教育图，建议尺寸 1400x400px
 * 当前使用项目已有图片占位，请替换为实际党建宣传图片
 */

const router = useRouter()
const store = useAppStore()
const banners = store.banners

const currentIndex = ref(0)
const isHovering = ref(false)
let autoPlayTimer: ReturnType<typeof setInterval> | null = null

// 自动播放间隔（毫秒）
const AUTO_PLAY_INTERVAL = 5000

function next(): void {
  currentIndex.value = (currentIndex.value + 1) % banners.length
}

function prev(): void {
  currentIndex.value = (currentIndex.value - 1 + banners.length) % banners.length
}

function goTo(index: number): void {
  currentIndex.value = index
}

function startAutoPlay(): void {
  stopAutoPlay()
  autoPlayTimer = setInterval(() => {
    if (!isHovering.value) {
      next()
    }
  }, AUTO_PLAY_INTERVAL)
}

function stopAutoPlay(): void {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer)
    autoPlayTimer = null
  }
}

function handleMouseEnter(): void {
  isHovering.value = true
}

function handleMouseLeave(): void {
  isHovering.value = false
}

/** 点击轮播图跳转到对应详情页 */
function handleBannerClick(banner: typeof banners[number]): void {
  if (banner.linkTo) {
    router.push(banner.linkTo)
  }
}

onMounted(() => {
  startAutoPlay()
})

onUnmounted(() => {
  stopAutoPlay()
})
</script>

<template>
  <div
    class="carousel-container"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 轮播图轨道 -->
    <div class="carousel-track">
      <div
        class="carousel-slides"
        :style="{ transform: `translateX(-${currentIndex * 100}%)` }"
      >
        <div
          v-for="banner in banners"
          :key="banner.id"
          class="carousel-slide"
          @click="handleBannerClick(banner)"
        >
          <img
            :src="banner.image"
            :alt="banner.title"
            class="slide-image"
          />
          <div class="slide-overlay">
            <h3 class="slide-title">{{ banner.title }}</h3>
            <p class="slide-subtitle">{{ banner.subtitle }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 左切换按钮 -->
    <button class="carousel-btn carousel-btn-left" @click="prev">
      <el-icon :size="20"><ArrowLeft /></el-icon>
    </button>

    <!-- 右切换按钮 -->
    <button class="carousel-btn carousel-btn-right" @click="next">
      <el-icon :size="20"><ArrowRight /></el-icon>
    </button>

    <!-- 底部指示点 -->
    <div class="carousel-indicators">
      <span
        v-for="(banner, index) in banners"
        :key="banner.id"
        class="indicator-dot"
        :class="{ active: index === currentIndex }"
        @click="goTo(index)"
      ></span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.carousel-container {
  position: relative;
  width: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  background: #eee;
}

.carousel-track {
  width: 100%;
  overflow: hidden;
}

.carousel-slides {
  display: flex;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.carousel-slide {
  flex: 0 0 100%;
  position: relative;
  width: 100%;
  height: 360px;
  cursor: pointer;
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.slide-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 40px 48px 32px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  color: #fff;
}

.slide-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 8px;
  letter-spacing: 1px;
}

.slide-subtitle {
  font-size: 15px;
  opacity: 0.9;
  margin: 0;
}

/* 左右切换按钮 */
.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.85);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
  opacity: 0;
  z-index: 2;

  &:hover {
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

.carousel-btn-left {
  left: 16px;
}

.carousel-btn-right {
  right: 16px;
}

.carousel-container:hover .carousel-btn {
  opacity: 1;
}

/* 指示点 */
.carousel-indicators {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 2;
}

.indicator-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.3s;

  &.active {
    background: #fff;
    width: 28px;
    border-radius: 5px;
  }

  &:hover:not(.active) {
    background: rgba(255, 255, 255, 0.8);
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .carousel-slide {
    height: 240px;
  }

  .slide-overlay {
    padding: 24px 20px 20px;
  }

  .slide-title {
    font-size: 20px;
  }

  .slide-subtitle {
    font-size: 13px;
  }

  .carousel-btn {
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 576px) {
  .carousel-slide {
    height: 180px;
  }

  .slide-title {
    font-size: 16px;
  }
}
</style>
