// Vendored from https://github.com/delvier/hanbraille (MIT, commit 69c9254).
// Compiled from hanbraille.ts via `tsc --target ES2020 --module ES2020`.
// Do not hand-edit — regenerate from upstream source instead. See ./LICENSE.
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _HanBraille_instances, _a, _HanBraille_hanMappingAntiCollision, _HanBraille_hanMappingContract, _HanBraille_hanMapping;
import { Braille } from "./braille.js";
export class HanBraille extends Braille {
    constructor(u11bc_null = false, u3163_isolate = false) {
        super();
        _HanBraille_instances.add(this);
        _HanBraille_hanMappingAntiCollision.set(this, [
            //제5절: Vowel chain
            { symbol: '', braille: _a.DotsToUni(3, 6), before: /[\u1161-\u11a7]/gu, after: /^\u110b\u1168/gu }, //(V)예: 제10항
            { symbol: '', braille: _a.DotsToUni(3, 6), before: /[\u1163\u116a\u116e\u116f]/gu, after: /^\u110b\u1162/gu }, //([ㅑㅘㅜㅝ])애: 제11항
            //제28항; This needs to go *before* the syllable, unlike UCS hangul
            ////always first because this changes character order; ignored if not related to hangul syllable
            { symbol: '', braille: _a.BraiToUCS([4, 5, 6], [2]), after: /^([\u1100-\u115f][\u1160-\u11a7][\u11a8-\u11ff]?)\u302e/gu }, //거성 1점
            { symbol: '', braille: _a.BraiToUCS([4, 5, 6], [1, 3]), after: /^([\u1100-\u115f][\u1160-\u11a7][\u11a8-\u11ff]?)\u302f/gu }, //상성 2점
            //제38항
            //number before ㄴㄷㅁㅋㅌㅍㅎ운
            { symbol: '', braille: _a.DotsToUni(0), before: /[0-9]/gu, after: /^([\u1102\u1103\u1106\u110f-\u1112]|\u110b\u116e\u11ab)/gu },
        ]);
        this.u11bc_null = u11bc_null;
        this.u3163_isolate = u3163_isolate;
    }
    HangBrai(hang, width = 0) {
        let d = hang.normalize('NFD');
        let o = '';
        let p = ' ';
        let linePos = 0;
        let isNumeric = false;
        let prohibitContract = false;
        const UEBDetect = /^[\p{Lu}\p{Ll}@#^&\u0391-\u03a1\u03a3-\u03a9\u03b1-\u03c9](([0-9\p{Lu}\p{Ll}@#^&\u0391-\u03a1\u03a3-\u03a9\u03b1-\u03c9]|\p{P}|\p{Lm}|\p{Mn}|\s)*([0-9\p{Lu}\p{Ll}@#^&\u0391-\u03a1\u03a3-\u03a9\u03b1-\u03c9]|\p{P}|\p{Lm}|\p{Mn}))?/gu;
        while (d !== '') {
            /* Code switching */
            if (!isNumeric && d.match(/^[0-9]/gu)) {
                //Enabling numeric mode in front of digits
                isNumeric = true;
                o += _a.DotsToUni(3, 4, 5, 6);
            }
            else if (UEBDetect.test(d)) {
                var q = d.slice(0, UEBDetect.lastIndex);
                d = d.slice(UEBDetect.lastIndex);
                o += _a.DotsToUni(3, 5, 6);
                q = this.UnifiedBrl(q);
                q = q.replace(/\u2820\u2804$/gu, ''); //remove capital terminator
                o += this.UnifiedBrl(q);
                o += _a.DotsToUni(2, 5, 6);
            }
            else if (isNumeric && d.match(/^[^0-9.,~\-]/gu)) {
                //Disabling numeric mode after non-digit appears
                // Korean rule accepts hyphens and swung dashes while numeric mode, unlike UEB
                isNumeric = false;
                if (o.match(/\u2824$/) && d.match(/^[\u1102\u1103\u1106\u110f-\u1112]\u1161/gu)) {
                    //hyphen before 나다마카타파하
                    prohibitContract = true;
                }
            }
            /* Actual conversion */
            if (d[0] === undefined) {
            }
            else if (d[0].match(/^\n/)) {
                o += '\n';
                p = d[0];
                d = d.slice(1);
            }
            else if (d[0].match(/^\s/gu)) {
                o += _a.DotsToUni(0);
                p = d[0];
                d = d.slice(1);
            }
            else
                hanExit: {
                    for (const x of __classPrivateFieldGet(this, _HanBraille_hanMappingAntiCollision, "f")) {
                        //assuring x.symbol is ''; new RegExp obj is necessary
                        let b;
                        if (x.before)
                            b = new RegExp(x.before);
                        let a;
                        if (x.after)
                            a = new RegExp(x.after);
                        if ((b === undefined || b.test(p))
                            && (a === undefined || a.test(d))) {
                            o += x.braille;
                        }
                    }
                    if (!prohibitContract) {
                        for (const x of __classPrivateFieldGet(this, _HanBraille_instances, "m", _HanBraille_hanMappingContract).call(this)) {
                            let regexp;
                            if (typeof (x.after) == 'object') { //RegExp
                                regexp = new RegExp('^' + x.symbol + '(?=' + x.after.source + ')', 'gu');
                            }
                            else {
                                regexp = new RegExp('^' + x.symbol, 'gu');
                            }
                            if (regexp.test(d)
                                && (x.condition === undefined || x.condition)
                                && (x.before === undefined || x.before.test(p))) {
                                o += x.braille;
                                p = d.slice(0, regexp.lastIndex);
                                d = d.slice(regexp.lastIndex);
                                break hanExit;
                            }
                        }
                    }
                    for (const x of __classPrivateFieldGet(this, _HanBraille_instances, "m", _HanBraille_hanMapping).call(this)) {
                        let regexp = new RegExp('^' + x.symbol, 'gu');
                        if (regexp.test(d) && (x.condition || x.condition === undefined)) {
                            o += x.braille;
                            p = d.slice(0, regexp.lastIndex);
                            d = d.slice(regexp.lastIndex);
                            prohibitContract = false;
                            break hanExit;
                        }
                    }
                    console.log(`Skipping ${d[0]}...`);
                    d = d.slice(1);
                }
        }
        return o;
    }
    ;
    ;
}
_a = HanBraille, _HanBraille_hanMappingAntiCollision = new WeakMap(), _HanBraille_instances = new WeakSet(), _HanBraille_hanMappingContract = function _HanBraille_hanMappingContract() {
    return [
        /* Special cases */
        //제52~58항: opening and closing
        //{symbol: '"(.*)"', braille: HanBraille.DotsToUni(2,3,6) + '$1' + HanBraille.DotsToUni(3,5,6)},
        //{symbol: "'(.*)'", braille: HanBraille.BraiToUCS([6],[2,3,6]) + '$1' + HanBraille.BraiToUCS([3,5,6],[3])},
        //제7절: Abbr. Only at the beginning of the line, or after a whitespace or a punctuation
        { symbol: '그래서'.normalize('NFD'), braille: _a.BraiToUCS([1], [2, 3, 4]), before: /(^|\s|\p{P})$/gu }, //그래서
        { symbol: '그러나'.normalize('NFD'), braille: _a.BraiToUCS([1], [1, 2]), before: /(^|\s|\p{P})$/gu }, //그러나
        { symbol: '그러면'.normalize('NFD'), braille: _a.BraiToUCS([1], [2, 5]), before: /(^|\s|\p{P})$/gu }, //그러면
        { symbol: '그러므로'.normalize('NFD'), braille: _a.BraiToUCS([1], [2, 6]), before: /(^|\s|\p{P})$/gu }, //그러므로
        { symbol: '그런데'.normalize('NFD'), braille: _a.BraiToUCS([1], [1, 3, 4, 5]), before: /(^|\s|\p{P})$/gu }, //그런데
        { symbol: '그리고'.normalize('NFD'), braille: _a.BraiToUCS([1], [1, 3, 6]), before: /(^|\s|\p{P})$/gu }, //그리고
        { symbol: '그리하여'.normalize('NFD'), braille: _a.BraiToUCS([1], [1, 5, 6]), before: /(^|\s|\p{P})$/gu }, //그리하여
        //제6절: Shorthands
        ////17항: shorthand prohibition
        { symbol: '나\u110b'.normalize('NFD'), braille: _a.BraiToUCS([1, 4], [1, 2, 6]) }, //나ㅇ
        { symbol: '다\u110b'.normalize('NFD'), braille: _a.BraiToUCS([2, 4], [1, 2, 6]) }, //다ㅇ
        { symbol: '따\u110b'.normalize('NFD'), braille: _a.BraiToUCS([6], [2, 4], [1, 2, 6]) }, //따ㅇ
        { symbol: '마\u110b'.normalize('NFD'), braille: _a.BraiToUCS([1, 5], [1, 2, 6]) }, //마ㅇ
        { symbol: '바\u110b'.normalize('NFD'), braille: _a.BraiToUCS([4, 5], [1, 2, 6]) }, //바ㅇ
        { symbol: '빠\u110b'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 5], [1, 2, 6]) }, //빠ㅇ
        { symbol: '자\u110b'.normalize('NFD'), braille: _a.BraiToUCS([4, 6], [1, 2, 6]) }, //자ㅇ
        { symbol: '짜\u110b'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 6], [1, 2, 6]) }, //짜ㅇ
        { symbol: '카\u110b'.normalize('NFD'), braille: _a.BraiToUCS([1, 2, 4], [1, 2, 6]) }, //카ㅇ
        { symbol: '타\u110b'.normalize('NFD'), braille: _a.BraiToUCS([1, 2, 5], [1, 2, 6]) }, //타ㅇ
        { symbol: '파\u110b'.normalize('NFD'), braille: _a.BraiToUCS([1, 4, 5], [1, 2, 6]) }, //파ㅇ
        { symbol: '하\u110b'.normalize('NFD'), braille: _a.BraiToUCS([2, 4, 5], [1, 2, 6]) }, //하ㅇ
        { symbol: '팠'.normalize('NFD'), braille: _a.BraiToUCS([1, 4, 5], [1, 2, 6], [3, 4]) }, //팠
        ////16항: exceptional shorthands
        { symbol: '성'.normalize('NFD'), braille: _a.BraiToUCS([6], [1, 2, 4, 5, 6]), condition: !this.u11bc_null }, //성
        { symbol: '썽'.normalize('NFD'), braille: _a.BraiToUCS([6], [6], [1, 2, 4, 5, 6]), condition: !this.u11bc_null }, //썽
        { symbol: '정'.normalize('NFD'), braille: _a.BraiToUCS([4, 6], [1, 2, 4, 5, 6]), condition: !this.u11bc_null }, //정
        { symbol: '쩡'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 6], [1, 2, 4, 5, 6]), condition: !this.u11bc_null }, //쩡
        { symbol: '청'.normalize('NFD'), braille: _a.BraiToUCS([5, 6], [1, 2, 4, 5, 6]), condition: !this.u11bc_null }, //청
        { symbol: '셩'.normalize('NFD'), braille: _a.BraiToUCS([6], [1, 5, 6], [2, 3, 5, 6]), condition: !this.u11bc_null }, //셩
        { symbol: '쎵'.normalize('NFD'), braille: _a.BraiToUCS([6], [6], [1, 5, 6], [2, 3, 5, 6]), condition: !this.u11bc_null }, //쎵
        { symbol: '졍'.normalize('NFD'), braille: _a.BraiToUCS([4, 6], [1, 5, 6], [2, 3, 5, 6]), condition: !this.u11bc_null }, //졍
        { symbol: '쪙'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 6], [1, 5, 6], [2, 3, 5, 6]), condition: !this.u11bc_null }, //쪙
        { symbol: '쳥'.normalize('NFD'), braille: _a.BraiToUCS([5, 6], [1, 5, 6], [2, 3, 5, 6]), condition: !this.u11bc_null }, //쳥
        ////12~15항
        { symbol: '가'.normalize('NFD'), braille: _a.DotsToUni(1, 2, 4, 6) }, //가
        { symbol: '까'.normalize('NFD'), braille: _a.BraiToUCS([6], [1, 2, 4, 6]) }, //까
        { symbol: '나'.normalize('NFD'), braille: _a.DotsToUni(1, 4) }, //나
        { symbol: '다'.normalize('NFD'), braille: _a.DotsToUni(2, 4) }, //다
        { symbol: '따'.normalize('NFD'), braille: _a.BraiToUCS([6], [2, 4]) }, //따
        { symbol: '마'.normalize('NFD'), braille: _a.DotsToUni(1, 5) }, //마
        { symbol: '바'.normalize('NFD'), braille: _a.DotsToUni(4, 5) }, //바
        { symbol: '빠'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 5]) }, //빠
        { symbol: '사'.normalize('NFD'), braille: _a.DotsToUni(1, 2, 3) }, //사
        { symbol: '싸'.normalize('NFD'), braille: _a.BraiToUCS([6], [1, 2, 3]) }, //싸
        { symbol: '자'.normalize('NFD'), braille: _a.DotsToUni(4, 6) }, //자
        { symbol: '짜'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 6]) }, //짜
        { symbol: '카'.normalize('NFD'), braille: _a.DotsToUni(1, 2, 4) }, //카
        { symbol: '타'.normalize('NFD'), braille: _a.DotsToUni(1, 2, 5) }, //타
        { symbol: '파'.normalize('NFD'), braille: _a.DotsToUni(1, 4, 5) }, //파
        { symbol: '하'.normalize('NFD'), braille: _a.DotsToUni(2, 4, 5) }, //하
        { symbol: '\u1165\u11a8', braille: _a.DotsToUni(1, 4, 5, 6) }, //ᅟᅥᆨ
        { symbol: '\u1165\u11a9', braille: _a.BraiToUCS([1, 4, 5, 6], [1]) }, //ᅟᅥᆩ
        { symbol: '\u1165\u11aa', braille: _a.BraiToUCS([1, 4, 5, 6], [3]) }, //ᅟᅥᆪ
        { symbol: '\u1165\u11ab', braille: _a.DotsToUni(2, 3, 4, 5, 6) }, //ᅟᅥᆫ
        { symbol: '\u1165\u11ac', braille: _a.BraiToUCS([2, 3, 4, 5, 6], [1, 3]) }, //ᅟᅥᆬ
        { symbol: '\u1165\u11ad', braille: _a.BraiToUCS([2, 3, 4, 5, 6], [3, 5, 6]) }, //ᅟᅥᆭ
        { symbol: '\u1165\u11af', braille: _a.DotsToUni(2, 3, 4, 5) }, //ᅟᅥᆯ
        { symbol: '\u1165\u11b0', braille: _a.BraiToUCS([2, 3, 4, 5], [1]) }, //ᅟᅥᆰ
        { symbol: '\u1165\u11b1', braille: _a.BraiToUCS([2, 3, 4, 5], [2, 6]) }, //ᅟᅥᆱ
        { symbol: '\u1165\u11b2', braille: _a.BraiToUCS([2, 3, 4, 5], [1, 2]) }, //ᅟᅥᆲ
        { symbol: '\u1165\u11b3', braille: _a.BraiToUCS([2, 3, 4, 5], [3]) }, //ᅟᅥᆳ
        { symbol: '\u1165\u11b4', braille: _a.BraiToUCS([2, 3, 4, 5], [2, 3, 6]) }, //ᅟᅥᆴ
        { symbol: '\u1165\u11b5', braille: _a.BraiToUCS([2, 3, 4, 5], [2, 5, 6]) }, //ᅟᅥᆵ
        { symbol: '\u1165\u11b6', braille: _a.BraiToUCS([2, 3, 4, 5], [3, 5, 6]) }, //ᅟᅥᆶ
        { symbol: '\u1167\u11ab', braille: _a.DotsToUni(1, 6) }, //ᅟᅧᆫ
        { symbol: '\u1167\u11ac', braille: _a.BraiToUCS([1, 6], [1, 3]) }, //ᅟᅧᆬ
        { symbol: '\u1167\u11ad', braille: _a.BraiToUCS([1, 6], [3, 5, 6]) }, //ᅟᅧᆭ
        { symbol: '\u1167\u11af', braille: _a.DotsToUni(1, 2, 5, 6) }, //ᅟᅧᆯ
        { symbol: '\u1167\u11b0', braille: _a.BraiToUCS([1, 2, 5, 6], [1]) }, //ᅟᅧᆰ
        { symbol: '\u1167\u11b1', braille: _a.BraiToUCS([1, 2, 5, 6], [2, 6]) }, //ᅟᅧᆱ
        { symbol: '\u1167\u11b2', braille: _a.BraiToUCS([1, 2, 5, 6], [1, 2]) }, //ᅟᅧᆲ
        { symbol: '\u1167\u11b3', braille: _a.BraiToUCS([1, 2, 5, 6], [3]) }, //ᅟᅧᆳ
        { symbol: '\u1167\u11b4', braille: _a.BraiToUCS([1, 2, 5, 6], [2, 3, 6]) }, //ᅟᅧᆴ
        { symbol: '\u1167\u11b5', braille: _a.BraiToUCS([1, 2, 5, 6], [2, 5, 6]) }, //ᅟᅧᆵ
        { symbol: '\u1167\u11b6', braille: _a.BraiToUCS([1, 2, 5, 6], [3, 5, 6]) }, //ᅟᅧᆶ
        { symbol: '\u1167\u11bc', braille: _a.DotsToUni(1, 2, 4, 5, 6), condition: !this.u11bc_null }, //ᅟᅧᆼ
        { symbol: '\u1169\u11a8', braille: _a.DotsToUni(1, 3, 4, 6) }, //ᅟᅩᆨ
        { symbol: '\u1169\u11a9', braille: _a.BraiToUCS([1, 3, 4, 6], [1]) }, //ᅟᅩᆩ
        { symbol: '\u1169\u11aa', braille: _a.BraiToUCS([1, 3, 4, 6], [3]) }, //ᅟᅩᆪ
        { symbol: '\u1169\u11ab', braille: _a.DotsToUni(1, 2, 3, 5, 6) }, //ᅟᅩᆫ
        { symbol: '\u1169\u11ac', braille: _a.BraiToUCS([1, 2, 3, 5, 6], [1, 3]) }, //ᅟᅩᆬ
        { symbol: '\u1169\u11ad', braille: _a.BraiToUCS([1, 2, 3, 5, 6], [3, 5, 6]) }, //ᅟᅩᆭ
        { symbol: '\u1169\u11bc', braille: _a.DotsToUni(1, 2, 3, 4, 5, 6), condition: !this.u11bc_null }, //ᅟᅩᆼ
        { symbol: '\u116e\u11ab', braille: _a.DotsToUni(1, 2, 4, 5) }, //ᅟᅮᆫ
        { symbol: '\u116e\u11ac', braille: _a.BraiToUCS([1, 2, 4, 5], [1, 3]) }, //ᅟᅮᆬ
        { symbol: '\u116e\u11ad', braille: _a.BraiToUCS([1, 2, 4, 5], [3, 5, 6]) }, //ᅟᅮᆭ
        { symbol: '\u116e\u11af', braille: _a.DotsToUni(1, 2, 3, 4, 6) }, //ᅟᅮᆯ
        { symbol: '\u116e\u11b0', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [1]) }, //ᅟᅮᆰ
        { symbol: '\u116e\u11b1', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [2, 6]) }, //ᅟᅮᆱ
        { symbol: '\u116e\u11b2', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [1, 2]) }, //ᅟᅮᆲ
        { symbol: '\u116e\u11b3', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [3]) }, //ᅟᅮᆳ
        { symbol: '\u116e\u11b4', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [2, 3, 6]) }, //ᅟᅮᆴ
        { symbol: '\u116e\u11b5', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [2, 5, 6]) }, //ᅟᅮᆵ
        { symbol: '\u116e\u11b6', braille: _a.BraiToUCS([1, 2, 3, 4, 6], [3, 5, 6]) }, //ᅟᅮᆶ
        { symbol: '\u1173\u11ab', braille: _a.DotsToUni(1, 3, 5, 6) }, //ᅟᅳᆫ
        { symbol: '\u1173\u11ac', braille: _a.BraiToUCS([1, 3, 5, 6], [1, 3]) }, //ᅟᅳᆬ
        { symbol: '\u1173\u11ad', braille: _a.BraiToUCS([1, 3, 5, 6], [3, 5, 6]) }, //ᅟᅳᆭ
        { symbol: '\u1173\u11af', braille: _a.DotsToUni(2, 3, 4, 6) }, //ᅟᅳᆯ
        { symbol: '\u1173\u11b0', braille: _a.BraiToUCS([2, 3, 4, 6], [1]) }, //ᅟᅳᆰ
        { symbol: '\u1173\u11b1', braille: _a.BraiToUCS([2, 3, 4, 6], [2, 6]) }, //ᅟᅳᆱ
        { symbol: '\u1173\u11b2', braille: _a.BraiToUCS([2, 3, 4, 6], [1, 2]) }, //ᅟᅳᆲ
        { symbol: '\u1173\u11b3', braille: _a.BraiToUCS([2, 3, 4, 6], [3]) }, //ᅟᅳᆳ
        { symbol: '\u1173\u11b4', braille: _a.BraiToUCS([2, 3, 4, 6], [2, 3, 6]) }, //ᅟᅳᆴ
        { symbol: '\u1173\u11b5', braille: _a.BraiToUCS([2, 3, 4, 6], [2, 5, 6]) }, //ᅟᅳᆵ
        { symbol: '\u1173\u11b6', braille: _a.BraiToUCS([2, 3, 4, 6], [3, 5, 6]) }, //ᅟᅳᆶ
        { symbol: '\u1175\u11ab', braille: _a.DotsToUni(1, 2, 3, 4, 5) }, //ᅟᅵᆫ
        { symbol: '\u1175\u11ac', braille: _a.BraiToUCS([1, 2, 3, 4, 5], [1, 3]) }, //ᅟᅵᆬ
        { symbol: '\u1175\u11ad', braille: _a.BraiToUCS([1, 2, 3, 4, 5], [3, 5, 6]) }, //ᅟᅵᆭ
        { symbol: '것'.normalize('NFD'), braille: _a.BraiToUCS([4, 5, 6], [2, 3, 4]) }, //것
        { symbol: '껏'.normalize('NFD'), braille: _a.BraiToUCS([6], [4, 5, 6], [2, 3, 4]) }, //껏
    ];
}, _HanBraille_hanMapping = function _HanBraille_hanMapping() {
    return [
        //Numeric
        { symbol: '0', braille: Braille.DotsToUni(2, 4, 5) },
        { symbol: '1', braille: Braille.DotsToUni(1) },
        { symbol: '2', braille: Braille.DotsToUni(1, 2) },
        { symbol: '3', braille: Braille.DotsToUni(1, 4) },
        { symbol: '4', braille: Braille.DotsToUni(1, 4, 5) },
        { symbol: '5', braille: Braille.DotsToUni(1, 5) },
        { symbol: '6', braille: Braille.DotsToUni(1, 2, 4) },
        { symbol: '7', braille: Braille.DotsToUni(1, 2, 4, 5) },
        { symbol: '8', braille: Braille.DotsToUni(1, 2, 5) },
        { symbol: '9', braille: Braille.DotsToUni(2, 4) },
        //제1절
        { symbol: '\u1100', braille: _a.DotsToUni(4) }, //ㄱ
        { symbol: '\u1101', braille: _a.BraiToUCS([6], [4]) }, //ㄲ
        { symbol: '\u1102', braille: _a.DotsToUni(1, 4) }, //ㄴ
        { symbol: '\u1103', braille: _a.DotsToUni(2, 4) }, //ㄷ
        { symbol: '\u1104', braille: _a.BraiToUCS([6], [2, 4]) }, //ㄸ
        { symbol: '\u1105', braille: _a.DotsToUni(5) }, //ㄹ
        { symbol: '\u1106', braille: _a.DotsToUni(1, 5) }, //ㅁ
        { symbol: '\u1107', braille: _a.DotsToUni(4, 5) }, //ㅂ
        { symbol: '\u1108', braille: _a.BraiToUCS([6], [4, 5]) }, //ㅃ
        { symbol: '\u1109', braille: _a.DotsToUni(6) }, //ㅅ
        { symbol: '\u110a', braille: _a.BraiToUCS([6], [6]) }, //ㅆ
        { symbol: '\u110b', braille: _a.DotsToUni(1, 2, 4, 5), condition: false },
        { symbol: '\u110b', braille: "" }, //ㅇ: normally not written, 1-2-4-5 is a fallback
        { symbol: '\u110c', braille: _a.DotsToUni(4, 6) }, //ㅈ
        { symbol: '\u110d', braille: _a.BraiToUCS([6], [4, 6]) }, //ㅉ
        { symbol: '\u110e', braille: _a.DotsToUni(5, 6) }, //ㅊ
        { symbol: '\u110f', braille: _a.DotsToUni(1, 2, 4) }, //ㅋ
        { symbol: '\u1110', braille: _a.DotsToUni(1, 2, 5) }, //ㅌ
        { symbol: '\u1111', braille: _a.DotsToUni(1, 4, 5) }, //ㅍ
        { symbol: '\u1112', braille: _a.DotsToUni(2, 4, 5) }, //ㅎ
        //제3절
        { symbol: '\u1161', braille: _a.DotsToUni(1, 2, 6) }, //ㅏ
        { symbol: '\u1162', braille: _a.DotsToUni(1, 2, 3, 5) }, //ㅐ
        { symbol: '\u1163', braille: _a.DotsToUni(3, 4, 5) }, //ㅑ
        { symbol: '\u1164', braille: _a.BraiToUCS([3, 4, 5], [1, 2, 3, 5]) }, //ㅒ
        { symbol: '\u1165', braille: _a.DotsToUni(2, 3, 4) }, //ㅓ
        { symbol: '\u1166', braille: _a.DotsToUni(1, 3, 4, 5) }, //ㅔ
        { symbol: '\u1167', braille: _a.DotsToUni(1, 5, 6) }, //ㅕ
        { symbol: '\u1168', braille: _a.DotsToUni(3, 4) }, //ㅖ*
        { symbol: '\u1169', braille: _a.DotsToUni(1, 3, 6) }, //ㅗ
        { symbol: '\u116a', braille: _a.DotsToUni(1, 2, 3, 6) }, //ㅘ
        { symbol: '\u116b', braille: _a.BraiToUCS([1, 2, 3, 6], [1, 2, 3, 5]) }, //ㅙ
        { symbol: '\u116c', braille: _a.DotsToUni(1, 3, 4, 5, 6) }, //ㅚ
        { symbol: '\u116d', braille: _a.DotsToUni(3, 4, 6) }, //ㅛ
        { symbol: '\u116e', braille: _a.DotsToUni(1, 3, 4) }, //ㅜ
        { symbol: '\u116f', braille: _a.DotsToUni(1, 2, 3, 4) }, //ㅝ
        { symbol: '\u1170', braille: _a.BraiToUCS([1, 2, 3, 4], [1, 2, 3, 5]) }, //ㅞ
        { symbol: '\u1171', braille: _a.BraiToUCS([1, 3, 4], [1, 2, 3, 5]) }, //ㅟ
        { symbol: '\u1172', braille: _a.DotsToUni(1, 4, 6) }, //ㅠ
        { symbol: '\u1173', braille: _a.DotsToUni(2, 4, 6) }, //ㅡ
        { symbol: '\u1174', braille: _a.DotsToUni(2, 4, 5, 6) }, //ㅢ
        { symbol: '\u1175', braille: _a.DotsToUni(1, 3, 5) }, //ㅣ
        //제2절
        { symbol: '\u11a8', braille: _a.DotsToUni(1) }, //-ㄱ
        { symbol: '\u11a9', braille: _a.BraiToUCS([1], [1]) }, //-ㄲ
        { symbol: '\u11aa', braille: _a.BraiToUCS([1], [3]) }, //-ㄳ
        { symbol: '\u11ab', braille: _a.DotsToUni(2, 5) }, //-ㄴ
        { symbol: '\u11ac', braille: _a.BraiToUCS([2, 5], [1, 3]) }, //-ㄵ
        { symbol: '\u11ad', braille: _a.BraiToUCS([2, 5], [3, 5, 6]) }, //-ㄶ
        { symbol: '\u11ae', braille: _a.DotsToUni(3, 5) }, //-ㄷ
        { symbol: '\u11af', braille: _a.DotsToUni(2) }, //-ㄹ
        { symbol: '\u11b0', braille: _a.BraiToUCS([2], [1]) }, //-ㄺ
        { symbol: '\u11b1', braille: _a.BraiToUCS([2], [2, 6]) }, //-ㄻ
        { symbol: '\u11b2', braille: _a.BraiToUCS([2], [1, 2]) }, //-ㄼ
        { symbol: '\u11b3', braille: _a.BraiToUCS([2], [3]) }, //-ㄽ
        { symbol: '\u11b4', braille: _a.BraiToUCS([2], [2, 3, 6]) }, //-ㄾ
        { symbol: '\u11b5', braille: _a.BraiToUCS([2], [2, 5, 6]) }, //-ㄿ
        { symbol: '\u11b6', braille: _a.BraiToUCS([2], [3, 5, 6]) }, //-ㅀ
        { symbol: '\u11b7', braille: _a.DotsToUni(2, 6) }, //-ㅁ
        { symbol: '\u11b8', braille: _a.DotsToUni(1, 2) }, //-ㅂ
        { symbol: '\u11b9', braille: _a.BraiToUCS([1, 2], [3]) }, //-ㅄ
        { symbol: '\u11ba', braille: _a.DotsToUni(3) }, //-ㅅ
        { symbol: '\u11bb', braille: _a.DotsToUni(3, 4) }, //-ㅆ*
        { symbol: '\u11bc', braille: _a.BraiToUCS([5], [2, 3, 5, 6]), condition: this.u11bc_null }, //historical null sound jongseong (T)
        { symbol: '\u11bc', braille: _a.DotsToUni(2, 3, 5, 6) }, //-ㅇ
        { symbol: '\u11bd', braille: _a.DotsToUni(1, 3) }, //-ㅈ
        { symbol: '\u11be', braille: _a.DotsToUni(2, 3) }, //-ㅊ
        { symbol: '\u11bf', braille: _a.DotsToUni(2, 3, 5) }, //-ㅋ
        { symbol: '\u11c0', braille: _a.DotsToUni(2, 3, 6) }, //-ㅌ
        { symbol: '\u11c1', braille: _a.DotsToUni(2, 5, 6) }, //-ㅍ
        { symbol: '\u11c2', braille: _a.DotsToUni(3, 5, 6) }, //-ㅎ
        //제4절: Singular
        ////Assuming remaining Hangul Compatibility Jamo as the Jongseong (T) per 43항
        ////TODO: L-HJF, HCF-V, HCF-HJF-T (These are special cases)
        { symbol: '\u3131', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1]) }, //*ㄱ
        { symbol: '\u3134', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 5]) }, //*ㄴ
        { symbol: '\u3137', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [3, 5]) }, //*ㄷ
        { symbol: '\u3139', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2]) }, //*ㄹ
        { symbol: '\u3141', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 6]) }, //*ㅁ
        { symbol: '\u3142', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 2]) }, //*ㅂ
        { symbol: '\u3145', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [3]) }, //*ㅅ
        { symbol: '\u3147', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 3, 5, 6]) }, //*ㅇ
        { symbol: '\u3148', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 3]) }, //*ㅈ
        { symbol: '\u314a', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 3]) }, //*ㅊ
        { symbol: '\u314b', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 3, 5]) }, //*ㅋ
        { symbol: '\u314c', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 3, 6]) }, //*ㅌ
        { symbol: '\u314d', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 5, 6]) }, //*ㅍ
        { symbol: '\u314e', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [3, 5, 6]) }, //*ㅎ
        { symbol: '\u314f', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 2, 6]) }, //*ㅏ
        { symbol: '\u3151', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [3, 4, 5]) }, //*ㅑ
        { symbol: '\u3153', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 3, 4]) }, //*ㅓ
        { symbol: '\u3155', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 5, 6]) }, //*ㅕ
        { symbol: '\u3157', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 3, 6]) }, //*ㅗ
        { symbol: '\u315b', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [3, 4, 6]) }, //*ㅛ
        { symbol: '\u315c', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 3, 4]) }, //*ㅜ
        { symbol: '\u3160', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 4, 6]) }, //*ㅠ
        { symbol: '\u3161', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 4, 6]) }, //*ㅡ
        { symbol: '\u3162', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [2, 4, 5, 6]) }, //*ㅢ
        { symbol: '\u3163', braille: _a.BraiToUCS([4, 5, 6], [1, 3, 5]), condition: this.u3163_isolate }, //*isolated ㅣ
        { symbol: '\u3163', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [1, 3, 5]) }, //*ㅣ
        //제8절
        ////Todo: 제23항
        ////제19항
        { symbol: '\u1140', braille: _a.BraiToUCS([5], [4, 6]) }, //ㅿ
        { symbol: '\u11eb', braille: _a.BraiToUCS([5], [1, 3]) }, //-ㅿ
        { symbol: '\u114c', braille: _a.BraiToUCS([5], [1, 4, 5]) }, //ㆁ
        { symbol: '\u11f0', braille: _a.BraiToUCS([5], [2, 5, 6]) }, //-ㆁ
        { symbol: '\u1159', braille: _a.BraiToUCS([5], [2, 4, 5]) }, //ㆆ
        { symbol: '\u11f9', braille: _a.BraiToUCS([5], [3, 5, 6]) }, //-ㆆ
        { symbol: '\u317f', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [5], [4, 6]) }, //*ㅿ
        { symbol: '\u3181', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [5], [1, 4, 5]) }, //*ㆁ
        { symbol: '\u3186', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [5], [2, 4, 5]) }, //*ㆆ
        ////제20항
        { symbol: '\u111d', braille: _a.BraiToUCS([5], [1, 5], [2, 3, 5, 6]) }, //ㅱ
        { symbol: '\u11e2', braille: _a.BraiToUCS([5], [2, 6], [2, 3, 5, 6]) }, //-ㅱ
        { symbol: '\u112b', braille: _a.BraiToUCS([5], [4, 5], [2, 3, 5, 6]) }, //ㅸ
        { symbol: '\u11e6', braille: _a.BraiToUCS([5], [1, 2], [2, 3, 5, 6]) }, //-ㅸ
        { symbol: '\u112c', braille: _a.BraiToUCS([5], [6], [4, 5], [2, 3, 5, 6]) }, //ㅹ
        { symbol: '\u1157', braille: _a.BraiToUCS([5], [1, 4, 5], [2, 3, 5, 6]) }, //ㆄ
        { symbol: '\u111b', braille: _a.BraiToUCS([5], [5], [2, 3, 5, 6]) }, //ᄛᅠ
        ////제21항
        { symbol: '\u1114', braille: _a.BraiToUCS([5], [1, 4], [1, 4]) }, //ㅥ
        { symbol: '\u1147', braille: _a.BraiToUCS([5], [1, 2, 4, 5], [1, 2, 4, 5]) }, //ㆀ
        { symbol: '\u1158', braille: _a.BraiToUCS([5], [2, 4, 5], [2, 4, 5]) }, //ㆅ
        ////제22항
        { symbol: '\u111e', braille: _a.BraiToUCS([5], [4, 5], [4]) }, //ㅲ
        { symbol: '\u1120', braille: _a.BraiToUCS([5], [4, 5], [2, 4]) }, //ㅳ
        { symbol: '\u1121', braille: _a.BraiToUCS([5], [4, 5], [6]) }, //ㅄ
        { symbol: '\u1122', braille: _a.BraiToUCS([5], [4, 5], [6], [4]) }, //ㅴ
        { symbol: '\u1123', braille: _a.BraiToUCS([5], [4, 5], [6], [2, 4]) }, //ㅵ
        { symbol: '\u1127', braille: _a.BraiToUCS([5], [4, 5], [4, 6]) }, //ㅶ
        { symbol: '\u1129', braille: _a.BraiToUCS([5], [4, 5], [1, 2, 5]) }, //ㅷ
        { symbol: '\u112d', braille: _a.BraiToUCS([5], [6], [4]) }, //ㅺ
        { symbol: '\u112e', braille: _a.BraiToUCS([5], [6], [1, 4]) }, //ㅻ
        { symbol: '\u112f', braille: _a.BraiToUCS([5], [6], [2, 4]) }, //ㅼ
        { symbol: '\u1132', braille: _a.BraiToUCS([5], [6], [4, 5]) }, //ㅽ
        { symbol: '\u1136', braille: _a.BraiToUCS([5], [6], [4, 6]) }, //ㅾ
        { symbol: '\u11c7', braille: _a.BraiToUCS([2, 5], [3]) }, //-ㅧ
        { symbol: '\u11c8', braille: _a.BraiToUCS([2, 5], [5], [1, 3]) }, //-ㅨ
        { symbol: '\u11d9', braille: _a.BraiToUCS([2], [5], [3, 5, 6]) }, //-ㅭ
        { symbol: '\u11da', braille: _a.BraiToUCS([2, 6], [1]) }, //-ᅟᅠᇚ
        { symbol: '\u11dd', braille: _a.BraiToUCS([2, 6], [3]) }, //-ㅯ
        { symbol: '\u11df', braille: _a.BraiToUCS([2, 6], [5], [1, 3]) }, //-ㅰ
        //제9절
        ////제25항
        { symbol: '\u119e', braille: _a.BraiToUCS([5], [3, 4, 5, 6]) }, //ㆍ
        { symbol: '\u11a1', braille: _a.BraiToUCS([5], [3, 4, 5, 6], [1, 2, 3, 5]) }, //ㆎ
        { symbol: '\u318d', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [5], [3, 4, 5, 6]) }, //*ㆍ
        { symbol: '\u318e', braille: _a.BraiToUCS([1, 2, 3, 4, 5, 6], [5], [3, 4, 5, 6], [1, 2, 3, 5]) }, //*ㆎ
        ////제26항
        { symbol: '\u1188', braille: _a.BraiToUCS([4, 5, 6], [3, 4, 6], [1, 3, 5]) }, //ㆉ
        { symbol: '\u1184', braille: _a.BraiToUCS([4, 5, 6], [3, 4, 6], [3, 4, 5]) }, //ㆇ
        { symbol: '\u1185', braille: _a.BraiToUCS([4, 5, 6], [3, 4, 6], [3, 4, 5], [1, 2, 3, 5]) }, //ㆈ
        { symbol: '\u1194', braille: _a.BraiToUCS([4, 5, 6], [1, 4, 6], [1, 3, 5]) }, //ㆌ
        { symbol: '\u1191', braille: _a.BraiToUCS([4, 5, 6], [1, 4, 6], [1, 5, 6]) }, //ㆊ
        { symbol: '\u1192', braille: _a.BraiToUCS([4, 5, 6], [1, 4, 6], [3, 4]) }, //ㆋ
        //제12절: 문장 부호
        { symbol: '\\.', braille: _a.DotsToUni(2, 5, 6) },
        { symbol: '\\?', braille: _a.DotsToUni(2, 3, 6) },
        { symbol: '!', braille: _a.DotsToUni(2, 3, 5) },
        { symbol: ',', braille: _a.DotsToUni(5) },
        { symbol: '·', braille: _a.BraiToUCS([5], [2, 3]) },
        { symbol: ':', braille: _a.BraiToUCS([5], [2]) },
        { symbol: ';', braille: _a.BraiToUCS([5, 6], [2, 3]) },
        { symbol: '/', braille: _a.BraiToUCS([4, 5, 6], [3, 4]) },
        { symbol: '“', braille: _a.DotsToUni(2, 3, 6) },
        { symbol: '”', braille: _a.DotsToUni(3, 5, 6) },
        { symbol: "‘", braille: _a.BraiToUCS([6], [2, 3, 6]) },
        { symbol: "’", braille: _a.BraiToUCS([3, 5, 6], [3]) },
        { symbol: '\\(', braille: _a.BraiToUCS([2, 3, 6], [3]) },
        { symbol: '\\)', braille: _a.BraiToUCS([6], [3, 5, 6]) },
        { symbol: '\\{', braille: _a.BraiToUCS([2, 3, 6], [2]) },
        { symbol: '\\}', braille: _a.BraiToUCS([5], [3, 5, 6]) },
        { symbol: '\\[', braille: _a.BraiToUCS([2, 3, 6], [2, 3]) },
        { symbol: '\\]', braille: _a.BraiToUCS([5, 6], [3, 5, 6]) },
        { symbol: '『', braille: _a.BraiToUCS([5, 6], [2, 3, 6]) },
        { symbol: '』', braille: _a.BraiToUCS([3, 5, 6], [2, 3]) },
        { symbol: '《', braille: _a.BraiToUCS([5, 6], [2, 3, 6]) },
        { symbol: '》', braille: _a.BraiToUCS([3, 5, 6], [2, 3]) },
        { symbol: '「', braille: _a.BraiToUCS([5], [2, 3, 6]) },
        { symbol: '」', braille: _a.BraiToUCS([3, 5, 6], [2]) },
        { symbol: '〈', braille: _a.BraiToUCS([5], [2, 3, 6]) },
        { symbol: '〉', braille: _a.BraiToUCS([3, 5, 6], [2]) },
        { symbol: '-', braille: _a.DotsToUni(3, 6) },
        { symbol: '—', braille: _a.BraiToUCS([3, 6], [3, 6]) },
        { symbol: '~', braille: _a.BraiToUCS([3, 6], [3, 6]) },
        { symbol: '……', braille: _a.BraiToUCS([6], [6], [6]) },
        { symbol: '…', braille: _a.BraiToUCS([6], [6], [6]) },
        { symbol: '\\*', braille: _a.BraiToUCS([3, 5], [3, 5]) },
        { symbol: '※', braille: _a.BraiToUCS([4, 5, 6], [3, 5]), condition: false },
        { symbol: '※', braille: _a.BraiToUCS([3, 5], [3, 5]) },
        { symbol: "'", braille: _a.DotsToUni(3) }, //Apostrophe
        { symbol: '〃', braille: _a.BraiToUCS([5, 6], [2, 3]) },
        { symbol: 'ː', braille: _a.BraiToUCS([6], [3]) },
        { symbol: '₩', braille: _a.BraiToUCS([4], [2, 4, 5, 6]) },
        { symbol: '￦', braille: _a.BraiToUCS([4], [2, 4, 5, 6]) },
        { symbol: '¢', braille: _a.BraiToUCS([4], [1, 4]) },
        { symbol: '\\$', braille: _a.BraiToUCS([4], [1, 4, 5]) },
        { symbol: '£', braille: _a.BraiToUCS([4], [1, 2, 3]) },
        { symbol: '¥', braille: _a.BraiToUCS([4], [1, 3, 4, 5, 6]) },
        { symbol: '€', braille: _a.BraiToUCS([4], [1, 5]) },
        { symbol: '\u302e', braille: '' },
        { symbol: '\u302f', braille: '' }, //discarding isolated bangjeom
    ];
};
