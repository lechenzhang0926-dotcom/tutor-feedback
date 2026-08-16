// ============================================================
// 作业群消息模板
// ============================================================

interface HomeworkMessageInput {
  studentName: string;
  date: string;
  link1: string;
}

export function buildHomeworkMessage({ studentName, date, link1 }: HomeworkMessageInput): string {
  // Parse YYYY-MM-DD as Beijing date regardless of local timezone
  const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let month: number, day: number;
  if (parts) {
    month = parseInt(parts[2], 10);
    day = parseInt(parts[3], 10);
  } else {
    const d = new Date(date);
    month = d.getMonth() + 1;
    day = d.getDate();
  }
  const dateStr = `${month}月${day}日`;

  return `🌸 ${studentName} ${dateStr} 作业 🌸
1️⃣ 打印3个PDF文档（中英文、英译中、中译英），按抗遗忘日期拿中英文版本的PDF文档进行复习，将复习过程录制下来发在群里；这是pdf打印的链接：${link1} 👉 推荐用微信端（天天词霸）小程序完成复习，点抗遗忘，当天新学单词在第二天栏，录复习过程发群里；（小程序发在群里）
复习完做英译中PDF，拍照📸打卡发群里。
2️⃣ 复习3次之后，完成中译英版本（解决拼写问题），拍照📸打卡发群里。`;
}
