<script setup lang="ts">
/**
 * Login.vue - 登录页
 *
 * 对标川农大一统一身份认证（川农e认证）的登录界面：
 * 全屏背景图 + 半透明黑色遮罩，中央白色登录卡片，左侧微信扫码面板，
 * 右侧表单（短信登录 / 密码登录 双 Tab）。
 * 品牌文案从「川农e认证 / 四川农业大学」替换为「党建云平台」。
 *
 * 说明：当前为 Mock 登录，提交后写入 store 并跳转首页，后续可替换为真实接口。
 */
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import QRCode from "qrcode";
import { ElMessage } from "element-plus";
import { useAppStore } from "@/stores/app";

const store = useAppStore();
const router = useRouter();

// 当前激活的 Tab：短信登录 / 密码登录
const activeTab = ref<"sms" | "password">("sms");

// 背景图与党徽（复用项目已有资源）
const bgUrl = new URL("@/assets/images/Background/06f1a3dc430b143046aa95a6c411960a.jpg", import.meta.url).href;
const emblemUrl = new URL("@/assets/images/Party/党徽黄色1024X1024.png", import.meta.url).href;

// 扫码登录二维码（生成指向登录页的二维码占位，Mock）
const qrUrl = ref("");

// 短信登录字段
const phone = ref("");
const captchaInput = ref("");
const smsCode = ref("");

// 图形验证码（Mock）：4 位字母数字
const captchaText = ref("");
const captchaChars = ref<{ ch: string; rot: number; dx: number; dy: number }[]>([]);

// 短信验证码倒计时
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

// 密码登录字段
const account = ref("");
const password = ref("");

function randomCaptcha(): void {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const list: { ch: string; rot: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < 4; i++) {
    list.push({
      ch: chars[Math.floor(Math.random() * chars.length)],
      rot: Math.random() * 30 - 15,
      dx: Math.random() * 6 - 3,
      dy: Math.random() * 6 - 3,
    });
  }
  captchaText.value = list.map((c) => c.ch).join("");
  captchaChars.value = list;
}

onMounted(async () => {
  randomCaptcha();
  // 生成扫码登录二维码（指向本站登录页，Mock）
  qrUrl.value = await QRCode.toDataURL(`${window.location.origin}${window.location.pathname}#/login?scan=1`, {
    width: 120,
    margin: 0,
  });
});

function handleGetCode(): void {
  if (!/^1\d{10}$/.test(phone.value)) {
    ElMessage.warning("请输入正确的手机号");
    return;
  }
  if (countdown.value > 0) return;
  // Mock：模拟发送短信验证码
  ElMessage.success("验证码已发送（Mock：123456）");
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      if (timer) clearInterval(timer);
    }
  }, 1000);
}

function handleLogin(): void {
  if (activeTab.value === "sms") {
    if (!/^1\d{10}$/.test(phone.value)) {
      ElMessage.warning("请输入正确的手机号");
      return;
    }
    if (captchaInput.value.trim().toUpperCase() !== captchaText.value) {
      ElMessage.warning("请输入正确的图形验证码");
      randomCaptcha();
      return;
    }
    if (!smsCode.value.trim()) {
      ElMessage.warning("请输入短信验证码");
      return;
    }
    store.login(phone.value, "super_admin");
  } else {
    if (!account.value.trim() || !password.value.trim()) {
      ElMessage.warning("请输入账号和密码");
      return;
    }
    store.login(account.value.trim(), "super_admin");
  }
  ElMessage.success("登录成功");
  router.push("/");
}
</script>

<template>
  <div class="login-page" :style="{ backgroundImage: `url(${bgUrl})` }">
    <!-- 半透明黑色遮罩 -->
    <div class="login-mask"></div>

    <main class="login-main">
      <section class="login-section">
        <!-- 左侧：平台标识 -->
        <div class="login-brand">
          <img :src="emblemUrl" alt="党建云平台" class="brand-emblem" />
          <span class="brand-title">党建云平台</span>
        </div>

        <!-- 右侧：登录卡片 -->
        <div class="login-card">
          <!-- 左侧扫码面板 -->
          <div class="login-qr-panel">
            <div class="qr-title">打开微信APP</div>
            <div class="qr-sub">扫一扫</div>
            <img v-if="qrUrl" :src="qrUrl" alt="二维码" class="qr-img" />
          </div>

          <!-- 右侧表单面板 -->
          <div class="login-form-panel">
            <!-- 头部：Logo + 欢迎语 -->
            <div class="form-header">
              <img :src="emblemUrl" alt="Logo" class="form-logo" />
              <span class="app-name">欢迎使用党建云平台</span>
            </div>

            <!-- Tab 切换 -->
            <ul class="login-tabs">
              <li class="pctabs" :class="{ active: activeTab === 'sms' }" @click="activeTab = 'sms'">短信登录</li>
              <li class="pctabs" :class="{ active: activeTab === 'password' }" @click="activeTab = 'password'">
                密码登录
              </li>
            </ul>

            <!-- 短信登录 -->
            <div v-show="activeTab === 'sms'" class="tab-pane">
              <!-- 手机号 -->
              <div class="field relative">
                <span class="prefix">+86</span>
                <input v-model="phone" type="tel" maxlength="11" class="input phone" placeholder="请输入手机号" />
              </div>
              <!-- 图形验证码 -->
              <div class="field relative">
                <input v-model="captchaInput" type="text" class="input captcha" placeholder="请输入验证码" />
                <div class="captcha-box" title="点击刷新" @click="randomCaptcha">
                  <span
                    v-for="(c, i) in captchaChars"
                    :key="i"
                    class="captcha-char"
                    :style="{ transform: `rotate(${c.rot}deg) translate(${c.dx}px, ${c.dy}px)` }"
                  >
                    {{ c.ch }}
                  </span>
                </div>
              </div>
              <!-- 短信验证码 -->
              <div class="field relative">
                <input v-model="smsCode" type="tel" maxlength="6" class="input" placeholder="输入短信验证码" />
                <button class="get-code" type="button" @click="handleGetCode">
                  {{ countdown > 0 ? `${countdown}s` : "获取验证码" }}
                </button>
              </div>
              <!-- 激活账号 -->
              <div class="field-row">
                <span class="activate-account">激活账号</span>
              </div>
            </div>

            <!-- 密码登录 -->
            <div v-show="activeTab === 'password'" class="tab-pane">
              <div class="field relative">
                <input v-model="account" type="text" class="input" placeholder="请输入手机号 / 工号" />
              </div>
              <div class="field relative">
                <input v-model="password" type="password" class="input" placeholder="请输入密码" />
              </div>
              <div class="field-row">
                <span class="activate-account">忘记密码</span>
              </div>
            </div>

            <!-- 登录按钮 -->
            <button class="login-btn" type="button" @click="handleLogin">登 录</button>
          </div>
        </div>
      </section>

      <!-- 底部版权 -->
      <footer class="login-footer">Copyright © 2026 党建云平台</footer>
    </main>
  </div>
</template>

<style lang="scss" scoped>
/* 全屏登录页 */
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 背景图 + 渐变色叠加，保持可读性 */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  position: relative;
}

/* 半透明黑色遮罩 */
.login-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1;
}

.login-main {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 960px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.login-section {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 56px;
}

/* 左侧：平台标识 */
.login-brand {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.brand-emblem {
  width: 182px;
  height: 182px;
  object-fit: contain;
}

.brand-title {
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 4px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* 登录卡片 */
.login-card {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background: #fff;
  border-radius: 8px;
  padding: 32px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.1),
    0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

/* 左侧扫码面板 */
.login-qr-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 24px;
}

.qr-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.qr-sub {
  font-size: 16px;
  color: #4b5563;
  margin-bottom: 8px;
}

.qr-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
}

/* 右侧表单面板 */
.login-form-panel {
  width: 300px;
  display: flex;
  flex-direction: column;
}

.form-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.form-logo {
  width: 46px;
  height: 46px;
  object-fit: contain;
}

.app-name {
  font-size: 24px;
  font-weight: 500;
  color: #111827;
  line-height: 46px;
}

/* Tab 切换 */
.login-tabs {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 20px;
  list-style: none;
  padding: 0;
  gap: 8px;
}

.pctabs {
  padding: 8px;
  font-size: 16px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.2s,
    border-color 0.2s;
  user-select: none;

  &.active {
    color: #428d43;
    border-bottom: 2px solid #428d43;
    font-weight: 500;
  }

  &:hover {
    color: #428d43;
  }
}

/* 表单字段 */
.tab-pane {
  display: flex;
  flex-direction: column;
}

.field {
  position: relative;
  margin-bottom: 16px;
}

.field-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

/* 输入框统一样式 */
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  font-size: 14px;
  color: #111827;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  height: 42px;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
}

.input.phone {
  padding-left: 48px;
}

.input.captcha {
  width: 60%;
}

/* +86 前缀 */
.prefix {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #4b5563;
  z-index: 1;
}

/* 图形验证码框 */
.captcha-box {
  position: absolute;
  right: 0;
  top: 0;
  width: 38%;
  height: 42px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: linear-gradient(135deg, #eef2ff, #f3f4f6);
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  user-select: none;
}

.captcha-char {
  font-size: 18px;
  font-weight: 700;
  color: #374151;
  font-style: italic;
}

/* 获取验证码按钮 */
.get-code {
  position: absolute;
  right: 4px;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding-left: 12px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: #166534;
  cursor: pointer;
}

/* 激活账号 / 忘记密码 */
.activate-account {
  font-size: 14px;
  color: #4b5563;
  cursor: pointer;

  &:hover {
    color: #428d43;
  }
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 24px;
  font-size: 18px;
  text-align: center;
  color: #fff;
  background: #6b7280;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  outline: none;
  transition: background 0.2s;

  &:hover {
    background: #4ade80;
  }
}

/* 底部版权 */
.login-footer {
  color: #fff;
  font-size: 14px;
  text-align: center;
  opacity: 0.9;
}

/* 响应式：小屏堆叠 */
@media (max-width: 768px) {
  .login-section {
    flex-direction: column;
    gap: 24px;
  }

  .login-brand {
    order: -1;
  }

  .brand-emblem {
    width: 96px;
    height: 96px;
  }

  .login-card {
    flex-direction: column;
    width: 100%;
  }

  .login-qr-panel {
    padding: 0 0 24px;
  }
}
</style>
