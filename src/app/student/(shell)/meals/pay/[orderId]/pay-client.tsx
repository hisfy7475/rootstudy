"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cancelPendingMealOrder } from "@/lib/actions/meal";
import { NICEPAY_PGWEB_SCRIPT_SRC } from "@/lib/nicepay";
import { isNativeApp } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/** 네이티브 앱 URL scheme — studycafe-app/src/constants.ts의 URL_SCHEME과 동일해야 함 */
const NATIVE_APP_SCHEME = "rootstudy://";

/** SSR/hydration 안전하게 네이티브 앱 scheme 반환. 서버: 빈 문자열, 클라이언트(네이티브 WebView): scheme. */
const subscribeNoop = () => () => {};
const getServerSchemeSnapshot = () => "";
const getClientSchemeSnapshot = () => (isNativeApp() ? NATIVE_APP_SCHEME : "");

declare global {
  interface Window {
    goPay?: (form: HTMLFormElement) => void;
    nicepaySubmit?: () => void;
    nicepayClose?: () => void;
  }
}

export type MealPaymentInit = {
  mid: string;
  ediDate: string;
  signData: string;
  amt: string;
  moid: string;
  goodsNameShort: string;
};

export function PayClient({
  paymentInit,
  returnUrl,
  mallReserved,
  backHref,
  mealRowId,
  displayAmount,
  displayGoodsName,
}: {
  paymentInit: MealPaymentInit | null;
  returnUrl: string;
  mallReserved: "s" | "p";
  backHref: string;
  mealRowId: string;
  displayAmount: number;
  displayGoodsName: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const appScheme = useSyncExternalStore(
    subscribeNoop,
    getClientSchemeSnapshot,
    getServerSchemeSnapshot,
  );

  useEffect(() => {
    // 이전 마운트에서 이미 로드 완료된 경우 — window.goPay 존재로 판단.
    // queueMicrotask로 effect 본문 밖으로 빼서 cascading render lint 회피.
    if (typeof window.goPay === "function") {
      queueMicrotask(() => setScriptReady(true));
      return;
    }
    // <script> 태그는 있지만 아직 로드 중 — 같은 태그의 load 이벤트에 붙어 대기.
    const existing = document.querySelector<HTMLScriptElement>('script[data-nicepay-pgweb="1"]');
    if (existing) {
      const onLoad = () => setScriptReady(true);
      existing.addEventListener("load", onLoad, { once: true });
      return () => existing.removeEventListener("load", onLoad);
    }
    // 첫 마운트 — 스크립트 주입.
    const s = document.createElement("script");
    s.src = NICEPAY_PGWEB_SCRIPT_SRC;
    s.async = true;
    s.dataset.nicepayPgweb = "1";
    s.onload = () => setScriptReady(true);
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!scriptReady) return;
    window.nicepaySubmit = () => {
      formRef.current?.submit();
    };
    window.nicepayClose = () => {
      setPaying(false);
      alert("결제가 취소되었습니다.");
    };
    return () => {
      delete window.nicepaySubmit;
      delete window.nicepayClose;
    };
  }, [scriptReady]);

  const startPay = useCallback(() => {
    if (!paymentInit) {
      alert("결제 설정(NEXT_PUBLIC_NICEPAY_MID, NICEPAY_MERCHANT_KEY)을 확인해 주세요.");
      return;
    }
    if (!returnUrl.startsWith("http")) {
      alert("NEXT_PUBLIC_SITE_URL(절대 URL)을 설정해 주세요.");
      return;
    }
    if (!window.goPay) {
      alert("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const form = formRef.current;
    if (!form) return;

    setPaying(true);
    try {
      window.goPay(form);
    } catch (e) {
      console.error(e);
      setPaying(false);
    }
  }, [paymentInit, returnUrl]);

  const handleCancel = async () => {
    await cancelPendingMealOrder(mealRowId);
    router.push(backHref);
  };

  return (
    <div className='space-y-4'>
      {paymentInit ? (
        <form
          ref={formRef}
          name='payForm'
          method='post'
          acceptCharset='utf-8'
          className='hidden'
          aria-hidden
        >
          <input type='hidden' name='PayMethod' value='CARD' />
          <input type='hidden' name='GoodsName' value={paymentInit.goodsNameShort} />
          <input type='hidden' name='Amt' value={paymentInit.amt} />
          <input type='hidden' name='MID' value={paymentInit.mid} />
          <input type='hidden' name='Moid' value={paymentInit.moid} />
          <input type='hidden' name='BuyerName' value='-' />
          <input type='hidden' name='BuyerEmail' value='' />
          <input type='hidden' name='BuyerTel' value='01000000000' />
          <input type='hidden' name='ReturnURL' value={returnUrl} />
          <input type='hidden' name='ReqReserved' value={mallReserved} />
          <input type='hidden' name='NpLang' value='KO' />
          <input type='hidden' name='GoodsCl' value='1' />
          <input type='hidden' name='TransType' value='0' />
          <input type='hidden' name='CharSet' value='utf-8' />
          <input type='hidden' name='EdiDate' value={paymentInit.ediDate} />
          <input type='hidden' name='SignData' value={paymentInit.signData} />
          {/* 네이티브 앱(WebView)에서 결제 시, 카드사 앱 이탈 후 우리 앱으로 복귀하기 위한 scheme.
              NICEPay v3 공식 필드명은 WapUrl (AppScheme 아님). 미설정 시 NICEPay가 외부 브라우저로 fallback. */}
          {appScheme && <input type='hidden' name='WapUrl' value={appScheme} />}
        </form>
      ) : null}

      <Card className='p-4 space-y-2'>
        <p className='text-sm text-muted-foreground'>결제 금액</p>
        <p className='text-2xl font-bold'>{displayAmount.toLocaleString("ko-KR")}원</p>
        <p className='text-sm font-medium'>{displayGoodsName}</p>
      </Card>

      {!paymentInit ? (
        <p className='text-sm text-destructive'>
          결제 연동 정보가 없습니다. 서버 환경변수 NEXT_PUBLIC_NICEPAY_MID, NICEPAY_MERCHANT_KEY를
          확인해 주세요.
        </p>
      ) : !scriptReady ? (
        <div className='flex items-center justify-center gap-2 text-muted-foreground text-sm py-8'>
          <Loader2 className='w-4 h-4 animate-spin' />
          결제 준비 중…
        </div>
      ) : (
        <Button className='w-full' size='lg' disabled={paying} onClick={startPay}>
          {paying ? "결제창 열림…" : "카드 결제하기"}
        </Button>
      )}

      <Button
        variant='outline'
        className='w-full'
        type='button'
        onClick={() => void handleCancel()}
      >
        돌아가기 (주문 취소)
      </Button>
    </div>
  );
}
