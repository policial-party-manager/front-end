<script setup lang="ts">
/**
 * 本地分页条：数据由服务端一次返回全部记录，这里只做前端切片导航。
 *
 * 共用它的页面必须自行把 `page` 交给 `slice()` 切片，并说明「不是服务端分页」，
 * 避免读者误以为切换页码会重新请求接口。
 */
const props = defineProps<{
  /** 总条数；不超过一页时不渲染分页条。 */
  total: number;
  /** 每页条数。 */
  pageSize: number;
  /** 分页器最大页码按钮数。 */
  pagerCount?: number;
  /** 页码说明文案。 */
  note?: string;
}>();
const emit = defineEmits<{ change: [page: number] }>();

const page = defineModel<number>("page", { required: true });
</script>

<template>
  <div v-if="props.total > props.pageSize" class="local-pager">
    <el-pagination
      v-model:current-page="page"
      :page-size="props.pageSize"
      :total="props.total"
      :pager-count="props.pagerCount ?? 5"
      layout="prev, pager, next"
      small
      background
      @current-change="emit('change', page)"
    />
    <span class="local-pager-note">{{ props.note ?? "本地分页：服务端一次返回全部记录" }}</span>
  </div>
</template>

<style lang="scss" scoped>
.local-pager {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;

  .local-pager-note {
    font-size: 12px;
    color: var(--text-secondary);
  }
}
</style>
