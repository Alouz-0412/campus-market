/* ==========================================================================
   order.js —— 拖拽排序的纯函数
   单独抽出来是因为「落点下标」的算法最容易出错（前插/后插的差一错误），
   而它不依赖 DOM，可以在 node 里当单元测试跑（见 smoke_test.py 第 15 节）。
   ========================================================================== */

/**
 * 把 list[from] 移到下标 to 处（原地修改）。
 * @returns {boolean} 是否真的发生了移动
 */
export function moveItem(list, from, to) {
  if (from === to) return false;
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return true;
}

/**
 * 计算拖拽落点下标。
 * @param {number} from  被拖动项的原下标
 * @param {number} over  当前悬停项的下标
 * @param {boolean} after 是否落在悬停项的右半边（右侧 = 插到它后面）
 * @returns {number} 目标下标，可直接交给 moveItem
 */
export function dropIndex(from, over, after) {
  let to = over + (after ? 1 : 0);
  if (from < to) to -= 1; // 先摘除会让后面的元素整体前移一格
  return to;
}
