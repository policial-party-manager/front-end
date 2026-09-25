<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getMyProfile, type ProfileResponse } from "@/api/profile";

const profile = ref<ProfileResponse | null>(null);
const loading = ref(true);
const loadError = ref(false);

const profileFields: { label: string; key: keyof ProfileResponse }[] = [
  { label: "姓名", key: "realName" },
  { label: "学号 / 工号", key: "studentId" },
  { label: "学院", key: "college" },
  { label: "年级", key: "grade" },
  { label: "专业", key: "major" },
  { label: "班级", key: "className" },
  { label: "所属支部", key: "branchName" },
  { label: "手机号码", key: "phone" },
  { label: "电子邮箱", key: "email" },
];

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "暂未填写";
}

async function loadProfile(): Promise<void> {
  loading.value = true;
  loadError.value = false;

  try {
    profile.value = await getMyProfile();
  } catch {
    profile.value = null;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});
</script>

<template>
  <main class="profile-page page-container">
    <header class="page-heading">
      <div>
        <span class="eyebrow">PERSONAL FILE / 个人档案</span>
        <h1>个人中心</h1>
        <p>查看本人基础资料与个人发展记录</p>
      </div>
      <el-tag class="readonly-tag" effect="plain" type="info">本人资料 · 只读</el-tag>
    </header>

    <section class="profile-section" aria-labelledby="basic-info-title">
      <div class="section-heading">
        <div>
          <span class="section-index">01 / INFORMATION</span>
          <h2 id="basic-info-title">个人资料</h2>
        </div>
        <p>认证信息只读；资料有误请联系管理员更新。</p>
      </div>

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载本人资料…</span>
      </div>
      <div v-else-if="loadError" class="state-card content-card" role="alert">
        <el-icon class="state-icon error-icon"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>个人资料暂时无法加载</h3>
          <p>请检查登录状态或网络连接后重试。</p>
        </div>
        <el-button type="primary" plain @click="loadProfile">
          <el-icon><Refresh /></el-icon>重新加载
        </el-button>
      </div>
      <el-empty v-else-if="!profile" description="暂未获取到个人资料">
        <el-button type="primary" plain @click="loadProfile">重新加载</el-button>
      </el-empty>
      <el-form v-else class="profile-form content-card" label-position="left" label-width="120px">
        <el-form-item v-for="field in profileFields" :key="field.key" :label="field.label">
          <span class="form-value">{{ displayValue(profile[field.key]) }}</span>
        </el-form-item>
      </el-form>
    </section>

    <section class="profile-section records-section" aria-labelledby="records-title">
      <div class="section-heading">
        <div>
          <span class="section-index">02 / MY RECORDS</span>
          <h2 id="records-title">个人记录</h2>
        </div>
        <p>相关查询接口就绪后，将在此展示本人记录。</p>
      </div>

      <div class="record-grid">
        <article class="record-card content-card">
          <span class="record-index">A</span>
          <div class="record-copy">
            <h3>个人培养档案</h3>
            <p>身份历史、思想汇报与培养材料</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
        <article class="record-card content-card">
          <span class="record-index">B</span>
          <div class="record-copy">
            <h3>活动与签到</h3>
            <p>本人参与活动及签到记录</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
        <article class="record-card content-card">
          <span class="record-index">C</span>
          <div class="record-copy">
            <h3>党校学习</h3>
            <p>课程参与与学习完成情况</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.profile-page {
  padding-top: 30px;
  padding-bottom: 52px;
}

.page-heading,
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.page-heading {
  margin-bottom: 24px;

  h1 {
    margin-top: 8px;
    color: var(--text-primary);
    font-family: "Songti SC", "SimSun", serif;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  p {
    margin-top: 4px;
    color: var(--text-secondary);
  }
}

.eyebrow,
.section-index {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.readonly-tag {
  margin-bottom: 5px;
}

.profile-section {
  margin-top: 34px;
}

.section-heading {
  margin-bottom: 15px;

  h2 {
    margin-top: 3px;
    color: var(--text-primary);
    font-size: 22px;
    font-weight: 650;
  }

  > p {
    padding-bottom: 2px;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: right;
  }
}

.section-index {
  color: var(--party-red);
  font-size: 9px;
}

.profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 20px 32px;

  :deep(.el-form-item) {
    min-width: 0;
    margin-bottom: 0;
    padding: 18px 16px;
    border-bottom: 1px solid var(--border-light);
  }

  :deep(.el-form-item:last-child) {
    grid-column: 1 / -1;
    border-bottom: 0;
  }

  :deep(.el-form-item__label) {
    color: var(--text-secondary);
    font-size: 15px;
  }

  :deep(.el-form-item__content) {
    min-width: 0;
    line-height: 36px;
  }
}

.form-value {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 600;
}

.state-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 150px;
}

.state-card[aria-busy="true"] {
  display: block;
}

.state-caption {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.state-icon {
  flex: 0 0 auto;
  font-size: 24px;
}

.error-icon {
  color: var(--party-red);
}

.state-copy {
  flex: 1;

  h3 {
    font-size: 15px;
  }

  p {
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.record-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.record-card {
  position: relative;
  display: flex;
  min-height: 174px;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;

  &::before {
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: var(--party-red);
    content: "";
  }
}

.record-index {
  color: rgba(193, 44, 31, 0.7);
  font-family: "Songti SC", "SimSun", serif;
  font-size: 13px;
  letter-spacing: 0.1em;
}

.record-copy {
  margin-top: 8px;

  h3 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 650;
  }

  p {
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 12px;
  }
}

.record-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 17px;
  color: var(--text-secondary);
  font-size: 11px;

  .el-icon {
    color: var(--party-red);
  }
}

@media (max-width: 992px) {
  .record-grid {
    grid-template-columns: 1fr;
  }

  .record-card {
    min-height: 145px;
  }
}

@media (max-width: 680px) {
  .profile-page {
    padding-top: 20px;
    padding-bottom: 34px;
  }

  .page-heading,
  .section-heading {
    align-items: flex-start;
  }

  .page-heading h1 {
    font-size: 27px;
  }

  .section-heading {
    flex-direction: column;
    gap: 5px;

    > p {
      text-align: left;
    }
  }

  .readonly-tag {
    flex: 0 0 auto;
  }

  .profile-form {
    grid-template-columns: 1fr;
    padding: 12px 16px;
  }

  .state-card:not([aria-busy="true"]) {
    flex-wrap: wrap;
  }
}
</style>
