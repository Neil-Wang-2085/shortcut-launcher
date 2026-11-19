# Shortcut Launcher for VS Code

鍦?VS Code 閲屾悳绱?**250+ 蹇嵎閿?/ 鍛戒护**锛屾敮鎸佷腑鏂囪鏄庯紝澶嶅埗鍛戒护鎴栨煡鐪嬮敭甯斤紝涓嶇敤鍒囧嚭缂栬緫鍣ㄣ€?
## 鐢ㄦ硶

- 蹇嵎閿細`Ctrl+Alt+Shift+K`锛坢acOS锛歚Cmd+Alt+Shift+K`锛?- 鍛戒护闈㈡澘锛歚Shortcut Launcher: Search Shortcuts & Commands`
- 鐘舵€佹爮锛氱偣鍑诲彸涓嬭 `鈱?Shortcuts`

鎼滅储锛?
| 杈撳叆 | 浣滅敤 |
|---|---|
| `word bold` | 澶氳瘝 AND |
| `ctrl b` | 鎸夋寜閿粍鍚堟壘 |
| `鍔犵矖` / `鍐荤粨绐楁牸` | 涓枃璇存槑鐩存帴鎼?|
| `git 鏀逛綔鑰呭悕瀛梎 | 涓嫳娣峰悎 |

鎵ц锛?
- **鍛戒护**锛氬鍒跺埌鍓创鏉匡紱鎻愮ず閲屽彲鐐广€屾彃鍏ョ粓绔€嶇洿鎺ユ墽琛?- **蹇嵎閿?*锛氬湪搴曢儴鎵撳紑閿附闈㈡澘锛屽睍绀烘寜閿?+ 涓枃璇存槑

## 鑷畾涔夊懡浠?
涓ょ鏂瑰紡锛?
1. 鎼滅储闈㈡澘搴曢儴 **锛?鏂板鑷畾涔夊懡浠も€?*锛屾寜鎻愮ず濉爣棰?/ 鍛戒护锛堟垨鎸夐敭锛? 涓枃璇存槑 / 鏍囩
2. 鍛戒护闈㈡澘鎵ц `Shortcut Launcher: Add Custom Command`

鍏朵粬鍛戒护锛?
- `Shortcut Launcher: Import Custom Entries (JSON)`锛氬鍏?JSON锛堟暟缁勬垨 `{ "entries": [...] }`锛?- `Shortcut Launcher: Open Custom Entries File`锛氱洿鎺ョ紪杈戝瓨鍌ㄦ枃浠?- `Shortcut Launcher: Delete Custom Entry`锛氬垹闄よ嚜瀹氫箟鏉＄洰

瀛樺偍浣嶇疆锛歏S Code 鐨?globalStorage

```
.../User/globalStorage/neilwang.shortcut-launcher/custom-entries.json
```

鏍煎紡涓庢闈㈢増涓€鑷达紝鍙洿鎺ヤ粠妗岄潰鐗堢殑 `user-entries.json` 澶嶅埗杩囨潵銆?
## 鍐呯疆鏁版嵁

250 鏉★紝瑕嗙洊 Office 涓変欢濂椼€丳hotoshop銆丟it銆丟DB銆乄indows銆乂S Code銆丆hrome/Edge銆佺粓绔€丆Make/Make銆丱utlook銆?
鏁版嵁涓庢闈㈢増鍏辩敤锛歚src/shared/data/*.json`銆乣src/shared/zh-desc.ts`銆?
## 瀹夎

### 浠?Marketplace

鍦?VS Code 鎵╁睍闈㈡澘鎼滅储 **Shortcut Launcher**锛屾垨锛?
```bash
code --install-extension neilwang.shortcut-launcher
```

### 浠?VSIX

```bash
code --install-extension shortcut-launcher-0.1.1.vsix
```

### 浠庢簮鐮?
```bash
cd vscode-extension
npm install
npm run build
npm run package
```

## 寮€鍙?
```bash
npm install
npm run build      # esbuild 鎵撳寘鍒?dist/extension.js
npm run typecheck  # tsc --noEmit
npm run package    # 鐢熸垚 .vsix
```

鍦?VS Code 閲屾寜 `F5` 鍚姩鎵╁睍寮€鍙戝涓诲嵆鍙皟璇曘€?
## 涓庢闈㈢増鐨勫叧绯?
妗岄潰鐗堬紙Electron锛夋彁渚涘叏灞€鐑敭銆侀€忔槑娴眰銆佽嚜瀹氫箟鏉＄洰锛涙墿灞曠増鑱氱劍銆屽湪缂栬緫鍣ㄥ唴蹇€熸煡/鎶勩€嶃€備袱鑰呭叡鐢ㄥ悓涓€濂楁暟鎹笌鎼滅储閫昏緫銆?
妗岄潰鐗堬細https://github.com/Neil-Wang-2085/shortcut-launcher

## License

MIT
