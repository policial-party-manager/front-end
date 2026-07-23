<script setup>
/**
 * FooterBar - 底部版权信息组件
 *
 * 包含版权声明、技术支持等信息
 * 红色背景，与顶部导航栏呼应
 */
</script>

<template>
  <footer class="footer-bar">
    <div class="footer-inner">
      <div class="footer-links">
        <a href="javascript:void(0)">关于我们</a>
        <span class="divider">|</span>
        <a href="javascript:void(0)">联系我们</a>
        <span class="divider">|</span>
        <a href="javascript:void(0)">使用帮助</a>
        <span class="divider">|</span>
        <a href="javascript:void(0)">隐私政策</a>
      </div>
      <div class="footer-info">
        <p>Copyright &copy; 2026 党建云平台. All Rights Reserved.</p>
        <p>XX大学XX学院党支部 版权所有 | 技术支持：党建云技术团队</p>
        <p class="footer-icp">ICP备案号：京ICP备XXXXXXXX号-1 | 公安机关备案号：XXXXXXXXXX</p>
      </div>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
.footer-bar {
  width: 100%;
  background: linear-gradient(135deg, #C12C1F 0%, #A01E1A 100%);
  color: rgba(255, 255, 255, 0.85);
}

.footer-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 28px 24px;
  text-align: center;
}

.footer-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  a {
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    transition: color 0.2s;

    &:hover {
      color: #fff;
      text-decoration: underline;
    }
  }

  .divider {
    color: rgba(255, 255, 255, 0.4);
  }
}

.footer-info {
  p {
    font-size: 13px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  .footer-icp {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 4px;
  }
}
</style>
