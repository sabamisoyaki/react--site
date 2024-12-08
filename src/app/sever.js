
const express = require('express');
const app = express();
const port = 3000;

// サンプルデータ
const data = {
  allReceivedData: [
    { title: "ローカルテスト1", epnumber: "ep1" },
    { title: "ローカルテスト2", epnumber: "ep2" },
    { title: "ローカルテスト3", epnumber: "ep3" }
  ]
};

// CORSを許可
const cors = require('cors');
app.use(cors());

// データを返すエンドポイント
app.get('/data', (req, res) => {
  res.json(data);
});

// サーバーを起動
app.listen(port, () => {
  console.log(`ローカルサーバーが http://localhost:${port} で起動しました`);
});
