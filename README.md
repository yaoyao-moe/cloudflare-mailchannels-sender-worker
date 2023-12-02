# cloudflare-mailchannels-sender-worker

这是一个使用 Cloudflare Worker 进行邮件处理的简单项目。

## 配置
支持通过 ENV 或 KV 进行鉴权

设置内容：
- `DKIM_CHECK` - 使用DKIM
- `USE_ENV` - 使用ENV而不是KV进行校验

文档待完善

## TODO
- [ ] 文档
- [x] DKIM (DKIM记录末尾不可以存在 `;` )
- [ ] 根据API KEY进行域名校验
- [ ] 收件处理
## 参考

- [Sending Email from Workers with MailChannels - Cloudflare Blog](https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/)
- [Send Email from Workers using MailChannels for Free - Cloudflare Community](https://community.cloudflare.com/t/send-email-from-workers-using-mailchannels-for-free/361973)
