# 7yuki_AutoReplay
7yuki.com网站每日自动回复以获取积分

## 使用方法
1. Fork该项目
2. 在Fork的项目中进入设置(settings)-密码和变量(Secrets and variables)-操作(Actions)
   ![步骤2](https://github.com/user-attachments/assets/5146e879-8b57-4164-8ae9-43e5c49355e9)
3. 创建仓库密码(New repository secret)，名称为BAIDU_AK,BAIDU_SK，并填写对应内容
   ![步骤3](https://github.com/user-attachments/assets/a50a3555-94ae-46b5-9c07-d6c478e09a0f)
-------------------------------------------------------------------------------------------------------
BAIDU_AK,BAIDU_SK需要申请百度文字识别api后在百度智能云控制台获取，具体申请步骤请上网搜索
![获取密钥](https://github.com/user-attachments/assets/f0753b7c-1470-42f2-b4b7-8b53d3d390c7)

## 多账户支持
本项目支持配置多个账户，有两种配置方式：

### 方式一：使用 ACCOUNTS_JSON (推荐)
创建一个名为 ACCOUNTS_JSON 的仓库密码(步骤类似上面的2,3)，内容为 JSON 格式：
```json
[
  {
    "username": "用户名1",
    "password": "密码1"
  },
  {
    "username": "用户名2",
    "password": "密码2"
  }
]
```

### 方式二：使用前缀命名
创建多个以不同前缀命名的仓库密码对：
- USER1_USERNAME 和 USER1_PASSWORD
- USER2_USERNAME 和 USER2_PASSWORD
该方式需要在yml中取消对应代码的注释

注意：如果配置了 ACCOUNTS_JSON，则其他方式的配置会被忽略。
