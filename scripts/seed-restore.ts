import Database from 'sql.js';
import fs from 'fs';

async function seed() {
  const SQL = await Database();
  const fileBuffer = fs.readFileSync('refinements.db');
  const db = new SQL.Database(fileBuffer);

  const mockData = [
    {
      input: '努力就会成功',
      final_logic: '成功是多变量非线性函数，努力只是其中一个变量的局部贡献',
      explanation: '努力确实是成功的重要因素之一，但它并非唯一决定因素。',
      stages: JSON.stringify([
        { name: 'architect', title: '逻辑解构 (Architect)', content: '努力→成功的线性因果链' },
        { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: '反例：很多人努力却未成功' },
        { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: '努力是必要非充分条件' }
      ]),
      cycles: 1,
    },
    {
      input: '知识就是力量',
      final_logic: '知识是认知势能的积累，力量是其在特定条件下的动能释放',
      explanation: '弗朗西斯·培根的这句名言揭示了知识与力量之间的转化关系。',
      stages: JSON.stringify([
        { name: 'architect', title: '逻辑解构 (Architect)', content: '知识→力量的直接等式' },
        { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: '反例：有知识但无力改变' },
        { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: '知识需要转化为行动' }
      ]),
      cycles: 1,
    },
    {
      input: '失败是成功之母',
      final_logic: '失败提供负反馈信号，但只有被正确解码才能成为成功的前因',
      explanation: '失败本身并不自动导致成功。关键在于是否能从失败中提取有价值的负反馈信息。',
      stages: JSON.stringify([
        { name: 'architect', title: '逻辑解构 (Architect)', content: '失败→学习→成功的循环' },
        { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: '反例：重复失败导致放弃' },
        { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: '需要反思机制才能转化' }
      ]),
      cycles: 1,
    },
    {
      input: '时间就是金钱',
      final_logic: '时间与金钱共享稀缺性特征，但时间具有不可逆性和不可储存性',
      explanation: '时间确实像金钱一样是稀缺资源，但两者有本质区别。',
      stages: JSON.stringify([
        { name: 'architect', title: '逻辑解构 (Architect)', content: '时间=金钱的等价替换' },
        { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: '反例：时间不能储蓄' },
        { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: '两者在稀缺性上相似' }
      ]),
      cycles: 1,
    },
    {
      input: '天生我材必有用',
      final_logic: '个体差异性是系统的鲁棒性来源，"有用"的定义需要扩展到生态位视角',
      explanation: '每个人都有独特的才能组合，但"有用"不应该被狭隘地定义。',
      stages: JSON.stringify([
        { name: 'architect', title: '逻辑解构 (Architect)', content: '天赋→用途的直接映射' },
        { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: '反例：很多天赋无处施展' },
        { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: '需要合适的生态位' }
      ]),
      cycles: 1,
    },
  ];

  const stmt = db.prepare(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles) VALUES (?, ?, ?, ?, ?)`
  );

  for (const data of mockData) {
    stmt.run([data.input, data.final_logic, data.explanation, data.stages, data.cycles]);
  }
  stmt.free();

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('refinements.db', buffer);

  console.log(`Inserted ${mockData.length} records`);
  db.close();
}

seed().catch(console.error);
