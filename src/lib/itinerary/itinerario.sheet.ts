import ExcelJS from 'exceljs';
import { Trip, TripStop, TransitLeg } from '../../types';
import { ResolvedOptions } from './types';
import { ItineraryLabels, modeLabel, weatherCodeLabel } from './labels';
import { C, ActivityStyle, applyActivityStyle, applyCityStyle, applyHeaderStyle, applyTimeSlotStyle, border, fill, freezeHeader, googleMapsSearchUrl } from './style';
import { addDays, dateKey, fmt, parseDMY, resolveCityName, shortDate } from './util';

// Favicon rendered to PNG via Python/Pillow — gradient circle with TB monogram
/** 120×120 PNG of the frontend's public/favicon.svg (F78 B8; the F55 one was corrupt). */
export const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAQAElEQVR4nOx9CZgkR3nli8y6q7r6vmZ6enruGY0GWQdClwGBAHuFBBgkDu1nDrMYrwWLuWX4FrHrNcjW2oI1GIQxrJDRMlzWsRySQBZIAgECCY1Go+mZ6Z7umelj+qrquo+MjciqzIzIoyqrp7sls4rvy8qj/oyIjBcvXvwReQTw3A5kBf81OsdPoC0eb/bfsxrOtDDWIvgFjrRwbquB+ji2koqw7uG5BLAfwIiP7UbHGoVmoNIGtn4qxLMSngsArwREIq4nn5nsVYOJbaGQupUodGspS3dVi9VN0NBGNS2uaYgRkChoNVk7i6QVIE8U5NiSJYQuk0hgMhhXnqEajpVK+aPL6eVju35v1+l6OtS29rvttr+u4dkE2A+wrusDvzjQNTC46YpCir66nKtcrpVpXylfQbWooVyoQCEElCFFFGau1dZUWCtK/X8i7lO2DyghglA0CDWsIBQJzCKMH0e7wveMT4/fe95556XgDmazCuC2vy7h2QDYL0NNUPfv369ecuErLirPaa+tFOgVlUJlTzFTJTpo4CVH68a1NQcnyBaiEihsISr0taLWItQq7AyNLdWqvub71SKrIKVqPUkqxctYjnAipClhckCNqPcHOgPffeixhx679tprq5DBbQQ+PPbXNKwnwF6M9VyfGJs/T60Er8nNld+QnS8NayUNms40ZsIYyEEMtamIJhnjIjrjEIgqOhP1YtTXFPqBOkNp/Xx5bZmVsmUGdhWVfFnfLqYKqFY0Viuo2QIEIyoiHdFjsd7o/iJy+zfuGHkK3mx+VoFeD4BbAZZMjqXOjYaCf1SYr1ybmSuO5JbKMJkZJIh2BhFJBhioHExVYJqBqhg8ytCoJF72RuWoh3KujHKmhEK6iMJSARpjOqkTNtIZQbQnPh7rDH2jVMx/p2frpschs/lZBXqtAfbVBPPlFw/8omtky973ZOaL12dnKkmuqVxCefOY6Akh3hMEK0SBcV5MNBjeGnPl82BWAoc9Y3KRAZ09nUVxMQ+tXNXzqIZVJPrb5kMd4c8cmjryxUsvvXQJTqD9dsxWLawVwH5Yqy9PPz22oT3U9ZH8nPbW9HQxSquafrmR9gCSA2HEu4N6AYoRma1vq8w1tdWewcZMp47zava0SpFfyCEzvawznMuGElAQ74tnIj2JWxdzy7ds37d9Bha4687mtQC4WW9YX+6+++7Ai8592V9kTpY+lpoqRTXW4eGFGe0IoGs4gnBboE4kWyFL+xazVqq5InONfev85kw39rlWZ0+lkV/M1nrx7L/kUEc+3B/57w//5pefueqqqyrwB/SqgrzaAPsCd3Js8WK1GLx17mhuZ4W5NvyaeDPcMRRGKK4KUVApshUz16a5Blhemisy1/i/mb1Ry8q5EpYnU6z5zurgB6OsJRruOlyO0HcNbtn0M6wzyKsJsBe45nLwV+PdXT09f5OeLF2XnikS7n+G4gr6dsZZQRi938baaj8uMtYfc+XjTTXXR7pu9qVMEalj82xd0I+zjhhNDLXfPjW3+JGzLjhrHjLQawbyagDsi7Wnji5cWC2GvjF/JLehWuZaRdC1OYz2wbBLlI2Yi4b29uMtaa5Huo2ZK5+ug2zkk+1np9NITyzUBlzYNXds6z2lhegb+7Zt/gXWgc1nCnAj1prbp09lrk9PVj6dOlkMauxCuYvTtzvG/FjVYgRgaqwrE9dAc9GQiY01t5m9yGjuVi08M4Uqc7f4CFpyqKscGkh8uHNo4POAZ097VUA+E4CbNskPPPBM8uytm/5pdjT3mkKqNujTyXS2Y3NE74g00tDV1FyH/Spqrpu9pfGCPQvpiXlkp5b0/XBHDG1be+98/OjT77z88svTWKMme6UANwV39InRvmRy6AdTB5b3VsuUDRNSDOxJsEEK1aZl3jX/WfFzG2i0H6Y3y2eBdb5SR2dRLVfYiFgQ7TsGnprLzP3BjnPOmcUagLwSgJuCe+SpyeF4oOve6UPZLRob5osyn7Z/d5yNRHlFuUrMbVVzpea/Bc21MujQXHjIh3hcK1WwNDqNUjrHykRF567BY6ezCy9ZC5BbBdgXuGGl88HZQ9kNPCuJXgYu6yU7NBT4d+Xnnglz4dFSpY/OIHc6BVVV0L69fyyrVV+5ae/2CTQGeV0AdgV34sj0Tm05du/8WH6QZ6N9Qwg9W6OQq7YY1kZzqQ8NXXPNdbF3pMfWyxOn2QDJgj6Rkdzae6oSIa8a2L79MFYJZAX+Q0NwDx0a36hl4j+aO5Yb5H92ba6BqzOmzkTj4om5JrWLRb1mm2vZ3lpb9lI8xLIXmWTYm5prs7f2IeTTsodgjwb21j7kFsZmb16v2ZKwFm64B21s4bNU6aOzGwJZ7f+OHzq00V6+Hhg0DX4BJi77FrgPTfTEK90/ZCNTffxAz9YIOjfVmGvUdLOGG8yp12hiYGA0yy72AqomZhDsqWBvMJkI9s3SNe2pLV1q2cNsdYV8CvLh7JAZddLefMv2fBXf0IXklj59Pz0+O9xWDf7g1z/5STvcQfbCxDX4AZjYtqVl//77om29Xd9jrtAOntnOTbXBCwqBEWJENiaazDU1t25srhsw12AQRMIJzAVkJkrpWumLTKcO5gp1i4gtjGBPZHsQy95qMWTmGn0BI55YfycSm7rBJyyWj03vHOnb+N379u+PupU53LFxDWqT/93A5YFXDHLbbbcFX3rBK789cyh3CZib29YfZOyNSRoqaZPAKAdz7fYOBkI4kdqYCpn51N2emuh620sdJA97UXO97OVa5LQXGWzYh9qieg+7ksmjnMoOj5y9+9z+LZv3//CHPxSrfUtMblYDiMuaLzrAM+PLfz/1ZP7PuJ8b71J1P9c5ZouGvc3fNT+XtpyuM/706AkU5tMIRENI7Nx4S+eWzR+tWUKrrx3tXDMAWwFXB/jU2PxLl8bwg/xiWfdzB89OsAx6pUOlSK1WrMXeMijsBG1oT20umHketU4jsr0tg5bGQz5urxT243Zi2xndiOmaRpE6NMH85Cwb8YrTyObeK7tGRn4MGWBfIHtpsFszYC5HDxztz8+qX88vVRAIEwycFWdHvTWX1KOrXYtdc4XCrtuvVHMJpD8g9pZb0lw7szw0Fy5M9NJc2DTXbi+mx2fZ2nduZGUbRHEpQypzy187dvDggB0HF4wcoVknS4xI377xxhsDYaX3DjZx0MW5MXhWQr9b0U1zpV4r0ILmUhMDiM2aQwOt3qxob9dcL3tA1lAve2lwpoFGW+e79a6tZhy2yiLLQe16lQCbR96+UR+zz5+a6+5UQrfzsnfDBE0A9Dpmj0TX3VOj6fefPlT463Kxit5tMSQHQ5A1158GifZYFS1bebpr0zdYnXzmTrKBkBOzDHAV8R1Df9m1Y9vfoQU9bgawtIyOTmyqnIg9mVuoRGOdTHf3xuEeGmluY3v7cfF8P/Zu6aKZ5gqnN9dc9+Nnorlic05c7JcOjqGynEWwI5FPB6o7dl1yyWlA0mI3oPVgb6Lt7DW2dQaHix1/n50vR1U2cd27MwYvzRU18Xk/190eNlCpEI+9MiR3bNKNK0vL0Z5E+y113IgLTrAdkwC2k0tq6ycPsV7z8cJVvAPQMRxGIKgAHpprahdWR3Prh619kXnrqLmiH+2moaI98dJcwFVz5eFQSLWaN8+JTX26XWFq7g0Lhw+/HM6W1o6dA2A7sOZy3xfvixQXyRf4DXLBKAN4MAKx9ysyzsFckxHWxdU34MlcItpDOI9IF2+3t/bd7SHYi4Up2ktMNDIg2VNPJpr5lDTXxlx4MVeu7EKt01eR/i4EYhFUC0Vo6ew/3PfFL0bcsLKDqQigwgvsfVdc+PblmdJmnii/QY67RCITG48t25loXLV1MSZzzfM9mAuZuVRgrphuI6bLzIOcnsA4e4fKsAexd4xkeyldD6a7Mte0FyuHkE9FQXxkg/53fnp+5MJXXvF2L1DdAJYAFZfPfe5zweyM9hdaVUO8JyTd1ioxF/DQXIvpqNt7Mhf/f/i5rswVWxopn5Z9KBlnHa02xi8N5dnF93FsPHAz4ZF2bEa6kJ84uvCOuQOlz2tViqFz2xCKrc59yz/7ZgUPfb2K50rYHPk3XNn7LgRIEWsRwm/4bwhc9h8lcM3KyoNYq819Y8eyr2TzWDowCiWoIrxz5O0927ffUbd0HeUyemNGlNJyzTXXKMVZ+lEOLn/iQAfXxrhmmgsXzdUqwPSohudS2Bh+dM3AJRE2GLRxT0uaazbbkO3VeAShzjZo5TKwkPoQx8hIBi4stlNaYu/JIwuvmztYuoPfxzx0blJonhsx1y3ITM4sAF//yxJSMxTPlUDYdFgyMMmY/CB2xb6L/tATbMhwBZVQDULdcj7UXZdC4eveETbN1guiqvDyc+FopuHQeCGjzCfOIHXwiD7aFd0z8trOLTt+AA8WB6zTzLW5XUqRGyoM3FhnUAfX1DihYyB1dEBcLsJpv3iSjdAseoMbSRCcfyXB7sv4M79Me+IE4UitY8IH4u/+uyoOPdy8csQ7gbf8lYLuDVY2cssU1RIbPJhmMvEdirHf1P6jbOY0VRnBbzN8eSs6A0fwpt3vRjA9Cr9B2XwOIu/8EpRkL5qPpHmXT7NZs0BbAkG2VDIZaIuZj7FYfgi52hhYUi8/mBx+cnxLYamyj0fazoYjAayan3t6oopyyb2Qtl1A8J/+IYBL36Sie4igrUcxweXp5NPA6ePwFboYsIlOsfWjiLWxY13Apr3A6z9KcPbl7m1OIb4d1StY2QXDvtIirDaFX/9JkLYetOrnQrAH3O3NZrtuHxmspVPNZC+YOPjEdriT1LsX3RbuelshVea9c/25XL+a28zP5c/XnnzayT5+Aee9WsVrP8SanXb5YsTe8tKspjfxfkIPqyChCDz9XH4b7yVvoOjod56b7AaiXTFm2+yeiFpQtr0Q6vALzGtp1c+lHppbx1yy5/uh9jaobACkvJQi7cHQNXDqby1fcO9ek9xC+Y2cMYk+Bi4xEjtzP7egM1AGmJ9yyRsVvOxtCtSQddDNz52fBIo5f9o9fDaa+rmdgwR7LnXGt2EHRTB3HLSU85WWuvlc2Y1t1c8lNv/aKD4b0y2tVhDsbNf/ryxm3gQXDGtWctAPjh2ee0FusbyZ/8kf61xNP9fOQJ7By96i4pJrVKgqbM2W08+dGvUHbjTJGLxJbGHq2aLUoX1nvZjo9mIY3MH+Ov6Er7SYe8H09/dwpn6u5F9DzK/FdAhMj/R01Zvp5Z1zh596gVGkYtZcNThIlXdU8lX9lUL8SfvVnM+dn6QSA/deruDCqxW9qhn2EJhr1XDOXA2nx+ErJHtqWis3fxZzIbQ0XKuHdlnnMq8G/QMZVE8c8JUWibdD7RluSXON6/KruW72aluctXhBlDNspgnqWyAzWA/2WQl9W8vh1TySRHe4qeaiieaKTORh4oDlemzaS6xm2UNzxRqePk2wMOWPwd1DW2QvoAAAEABJREFUtd64qLlW4RIpvQDT4pFzrHjb+1gFic+DLpz0lZbSt5W5Qt0taS48NZc2Za7YnAfYyBZ/l0k1l7saLljaGUwOPXpooJitbuAnh/UHxWzMNRMxzrKY4Ka5ogbmmYsyN1E7rXMQ+MPrVUTaTGqh2X3LS9NMw5fhK2zcqdd1h+batc9oYXqHCYJ1/e8ZYq5Z6hBo1l9vThnaBxKwXhCDFjVXZi5pwlxIshVqS9YqQ7E4/Pgjj3QB7r1o80DHYO+Fef7qInZSrCPoorl1Q5+aK14b1970XK33etmbVXQMEKkFaDafe4L1vqkPAofZjFf/Njg0t9F8bkc/07S6Dm9glUM7/jj78TGUqqgIjJwjaShMcOFLcy1S+GEuhMoPvZnmx8uplDIy1HeZkDP9rIDtAKlmycv5G9/4sCR/Il0EFyvQXEv7as3m9V8N1k4RWwAPzYXQ++V+s1//N5pkrk+fUUhWhI3mc3mzfP2X6rWnUkL+1id9paUw/5ds2N1Ucwk5c82VOpz1Da7BSjgIrViEUii/jB29C9ZVQhyL1kM5p72YH9CbZzg1t5mfa9dcy5zWXisI6+Lt9kQqDKFq8+Y9pWHuBHyF3mGmv23emktsjBY1mq/pMtPf2aP+EuvaCJLobqq5rfq5XpprypdgH0wmdHuaz73EljsiDVTfdNNNAa1Ed/BIIongivxcMRPGxUHQbpG5bn6u13zu0ozCfGgf7TMLA2xcJxAkErh2zZUKXdQ+ttLmjjP9TflKSx06GyQcb0lzffm5XsyFXFn1PERjtXwXSzs4hhB0WPKDr33dddvKhQobvCK1dz7iuTOfO8Vmn7yGN8XAb+Ed3O4E1665VGSuwCC+0o6zAWo/AxzMXhk5D61qLhGY67e3bNYd2JjO9tVo7Q4bWi4p11155TapPCA00dFIdFe1yKPgL9wMACvUXDcNFe39aC6EFoM/GnPiEHwFPsHAe8EQWxoqFo47c61mnA0c8A6Wj0DYmKqij4jAXqvhpqGrobmivVFLlHDt1uVqPo9EMrhLzKLURAeIurmUL+t31qshYmXWXHswl8ga7aah8Km51KWwSlmCxSn4Cp39qLleLvG7PZ9LbUyv6e8xX2kpbIREYRrsprnw1FzaInOdmis1eZzB4bC+pqUC84nVzfBqoqsluocPOwciisBcgQm+NNdiMuyaC+sivTRXSrd+EQszbHhzHr4C118+xdiK5oqMoOkZtpz2lRbpHmajWB2QdMlsEFbHz3XTXKF9N3fVSBj8tipUqnvEPEpNNK1ihEcejKpYDc2FlCmBQRDLRGa62Es3erkLrPdczFM0LXBS82H9aC4VNFe0104eBM0twU9Qd1wMP5prkcIPcyFUfrhqLgR7Ix6FsZiPaCmVyoBYJFITXa1oUW7M38vciuaamXXR0JVormFg2E8caA4uD3ygonsj5MoiMhcic0UGW/aV0Ud8pUX4BAPXX0AAtVaUa625MOXMkEX+KQI+KKXxt9iLD43b5oM1LaInohD411zjGmUmwqfmunVQxMLRJ/gn4CvwOdxEJ5WYK2ku4NBcsfD5OCid8ef/8ol90rulti1VIrvmCtdn09CVaq4rudiPfrxa7RDzGZByrSGp010F/GsuhMRsmisw10tz7UyXmQdkF9kkg0/97R2mbBSrNc0V09OWptkEwylfaZGBbVAYyG6au9p+rkNzBXIZdgq/M4PqQ7nSxKfMYKok9cgVBSvRXDlTbpl3MtdNc4nArPmTtZsE/ITNZxMhXVlz4aG5Yro4fcy//g7tNVs6u+YSghY0V6z88K25sNlTjpkef0UCWGKwptE2rspEaay5XhpKzVTPTHNF+1OHrTrTKIRjTH832TSXyvGDOjVXtC+PPeZvgiHIOjRbzl1fzbXJomhPBQYzEraJWZUYrOeRf12EyomttZ9rdx0M+1KeYOoIfIU2NlGmTzDYmOvUXApXjS5kfd/BocQ6oLI5YHfNpS0y16fmSudb9ibzjceJqHyrrwQwJdoyN+Kv/PXWXIvJsGsurIv00lwi2MNRKICo2QU2f7w0A1+hc5AiHPejucTBXL2usblfbc5fb470DEOpTzDIzAPWxM+VNNdGHiNd5gPX7aQZcwlgRVWKulBrxsnr4+eKzRoV0uWzR9lF+AobdxP9zoxmfq6DufVCr7Les2/9HdgJGopiPf1cCPakzlyJHFrtKzXgGApB0mB2WpFbaZUq1tPPtdsbhT51lPqTxBC/C1KO38vP1VOhYl+ixgjt1DNMhH08usLsle0Xrr3morHmWnWhZq9/yY0fV1TpIiQGq4qS4q+e5yeul58raSasGl5hEwzTPh8q4AMcHf2alU+h+XcwFzJzjXxXj/7SV1ok1gmVDZetpp9bYZ275Y9eiPT796L8+PddyeXQXHvTV63U7AmR5jklgDVFS/FeNB/TdGWuXXMF5npprp3pVjMGobmyaTTl+kt8D3D0DAGxdpGxAiOI3GzbmcvXWmqWDXD4680p/DmYZJ+DuXqwMdGPn0uZBhX/9SY2WZ9mfnU3AsNnw83PlddWPDAZXNXPU1RV0hkJ4EBQneLnaGXNlblmc2Ik5si8k7nN/FxRc0UwUrO1x1T8hN7NbPw81JrmioVP58fZLNKcr7RIPxvgiCVb0Fyx8kPWXLZdeuArqE7Ubg9S2EwJae+HXXMN5sLGXGIWJPstlXR7TVGnxfzKblIYY/zmc/6tPjcNpWaqa6O5ov30UT7BgOYFzsyH94j5gm/mGozQTh72/wTD8LlYLc0tP/odFBnABmnUnRfrTydSH5orarQuqQVWWPzjmaHw02J+5Sa6XDnMv8HHX8Ovf3FzBZpLm2ouddVckenc8uRh+AoR5ta3D0BsQnwz1yi16sRvfKXFn/NVh3a3yFyn5vLzK0d/hQJrmlEt1w6xyYvAlnMAUH+aK8omi0NjGsxv3dEqRankJIDThdzhUKx2J0e1UP8Sm9GakNX3c0XGEcGe+7/zPm+w6xpkAPeImkuaMFdOl2sfnfJXmwirSQqfYGjIXKCZn0szTHfv/Bs9bROIgS1sdmoXPP1cKyErnnq61XxOT5ewKcPF+ZwDYGosk9NjxwJhReOR8WZajAx1rYRFFP+aa2TSvHin5or27PqR9ieJ6BvhAxyAf82FUBlYqzU/Cc3nBIPCH3biE/wNmQtvzeX7rFOVu/VPUT3+WyluddO+ura7+7mA5QUYwUiXFov69amRqPbVe+45AgFTicGXX375shoNHObzivzjyGYs66C5oj1/gtBvB4s/BWivXM00V5Qdevo4Y5K/OyhJ/1appWlVc2kxh8L+TzjA5dN3wd2XwrfmApJdJbNc+xRvMHz4xhtvlEYOHO/JUmPqT3jm+Nc0zWaCrL6fKzIdNo0+7u+ZL4SjtQl+iblorrkiCtUjj1p5bxKIUh8XcmVuY83lzXH+f38A5SfudcTL3SNl4y7fmmulU7PXMkxm+GR/PP4TR9z1tUlpqNUHAhEV5XxV72ytlZ9rn+Ux7FOnCcZ9PrXJR7kq5WaaS6R0pfRY01x5+kH4DVU+GVEpAo2Y66K5GnMJcv/4TlSeesA1XoXPLTP3CB7MtWsuFZiOSgVaLss6WHFohDwAEUvUhioNDuph9MjoI5vbN2vL0xmluFxCpCMMGQtqa6bEQiS2QpYZ5DzfiofnIs+Gye/7EsXiNIGfwO+T/tU9wMBWwqYLqUt6YscKEnM5o4rf+gQD2WdvjgPM2J7/8vUIXf42EDabpLb3sWgV6Xq1HGvu2cyUduoQquO/Qfm3P4bG79Kk3i90Cex7BShzj4hHecIkhbM8y8tL+v9qW0I7dHjyYVvU/DPGOsjGzXd8rZz49Ylfp4+ndyY2JNAx0m61EjCaVQhVwio08X/RXmytjAO8DuZSFOUC9CnByaeApx9iIGfQcgiGKbaeB+y6iGJoF9Vv2wmEiNT0Un7XQHZJH1So/PYHNTaVfDjaaxxIrB2x//xlBIbOEo6atdGyQ70lhFz8xYkxlGZOIjy89ZnEOZecj9qbdoy37WgBW4x6CMQDP2E1ZCf/Rj02Jz0YQeUOGG3MILFmnp4g+Pp/9T9S1SyUiwTP/AxsqV3C0B6Kaz9eRYS/EJexKX/rn/gea17voLBxVpUt5mNCUrk2L8/S4mn9zhIaTzxoi1qvHYabZBzQlzLK3w3Fg0yHKyjrvWmbhvIgNtMt+rn8Kf/VAtctbNxJa+BSfp/VKV0Dn6shwNwjwmZLGvm51KN3XV1O6zqlRKJgXaY7YdNf1Jto4xY7xViuvvpq9XMf+19PZ6YyG+MDcXRu6VwVzfWjKY00tFV7OFqaRoyAS35bs0fDlq2F8qkHT/t6ARYnWfM8zZrnDcOn3vLJ/7n7rrvu4i6SJiySH2yizwy1QHvgDm5TmM9B7C2vhp8r+a0e9s7eL8yLb8XPNahAiI0RNnuzxTGo42LfzM81ete1E4mQX9nezkS7Pczse9jrQ3CMvHMzteto77ydYwYng6UmWgpLmfRtkfYorRYrKKYLtsJyFk4rfq7VfBPb+QboRCo0yR6QKlEzP9duD8j21CpNqydIhHz69HMhpL+i+VxQmSSCnyvaGyNjlfSi/tJPNdlBpxeXvwb3QEU/GAL6dM8Fe8ZCyeBjvApkppdlzaV0xX4uHM2TbE/EwvJguitzTXuxclC5byA1c3LlsSoj0KqfKzMXMnPrG/Iavv1cu70RT3l2Sj8eSHb8avsLLx2Hk7362t5ESyCTuHILfyq/sJBHJVeSGCdpItzHlhsxUWK6YG/E42AubcJc8zyz1kmVjtrThZhfi+nezBWZJDAXduZCZi4s5oLIzCVmQUI4z4W5EGsjIy6bXKgszUMJhVCMJW+xgSuC7DKSJSzv/vCf3xXvT0zoH0w8lUarmgvI4Pp6PrdV5gIyuADgoaGga6i55Aw016zjDTRXYHppakKPP9DdP/G2D378briz12SwibZtG1y41c7QTfwz5LnTGWhMj0VGtKK5Zu/Pxlyn5tLWmAu5BahVMrgyEbZK5o+5PjWXUkelX03NNa5TKxVQXZwDCQRQ7ei5qd65ggeG1O2jHFJt+Oq3brsj2hef40mkT6bqmWikuZAZ0bLmkibMldOFR7oOe9jSBTyYC5yZ5tomZox0BXsI9n4110i3fGoSfGIh0DMw+fn9f32HG2ZiIMJi7EvDlnyZHT313sWnZ/8Hf+Kh9wWDCMZCDkaBOjXRzjjn/vN+rqu9XICmPS3kkD3wmP4icGXHWR9Ibvu9W2Hze2H7Ipq9F22vDfpy/53/dmtioG2c15zUsTl4ae7zfi71p7loTXONkD92SP8v0Dt4/J7v3n+bG1awBTt7jbWDxZOHj76qMp7/VilbROf2HkR7E3DrIHkzgjrAWhnThZrdAhPl82BjoJ98rpy5q1E+JeYWlSaOgERjqGze9fqebfv4xLIXew0aOMaiIWxLy6ad2+6NDyXv44mlxxvywGYAAAo3SURBVOdB+fsgbIVGV6S5Tqa7Mte0txe63d7GCBvTRSa6MrdlzYVk78ZcCPatai4PGhtvLp0Y0+2DG0buZeDeh8bsNTFt1MmCPYKZ/On/EutvK1FNw9LorK2whWaKPO/nWvbUbBuldMXzjaI2IoZsXxo7zAhVRrh/IHdscfF98P5QtKOJdhvJghu4PNJ9558/GemL3qKGAyguMcGfWpKbWchMFJkLBxPhj7kA3DTXTUNB11Bzyfr5uSYAbL88fQLl1DzUcBRa1+DN+y5+xSR8slcE2B48WXzbnd+8qWNb7xM8P5mJeZQzBaFZlJkoMUhgckvMtUqnKRNhq2T+mEuF/ArMpTYmSudb9jLzjfwS0860d2Ou1GKI6dXWNJdBkTXNiqogNLLryS/d+ZXPeIDryl7jUtz2iW2ROl0Hf/nESE8o8UhqbK4tEAmiZ98Q67orQs22FZK57zwuE5zazveOx2EvXoHIBOl/aleV+gW7lo3r8dp51FFwXvZmulJ6ze1ptYI8c4louYjQ8Pb58QJesvfCy47D2yWyk1IPzRjsupz1wnPGtYTyp9HuBCqFEtPjaf17Rm7MbV1zgVY1t95w+GSuGd2KNddgorvmWmGlmsvHGwqjB/TXGge6erRsOPnHdXApWmSwHWA3I3skeq0Z2LblnujG5GcDEa7HWaRGp+qZJAKILpoLrEhzDft101ysv59rnJ8/8pR+KyxCYZDBkZv7dr3gp2LZozGo0jG3jwKRBvtEWJOlfPbB/3DlH55fXsxtK2cLrDmpINQRh5sfZ4IOOLRW8nPt7bbN3mKi3PuFi4a628vpivYQ7AEqM5c6mWj1kkV7w87dXj7Pit84rzj2DLSlOTaTEEBo65773n/T59772GOPicBKI1VowF4vgO1Aeh5nCePs4Q1377v4oleWFjMD5eW8ntlQWxTNNdePnwvhPNvgAoTCcdVcG7hmdPXjcLtk6npUtLfWtgza4hH/RcN0YZ5fOjmOyuwp1q4qCG8965Fv3/mjN37805/mL1F2Y64bsNQ9/+6BuKzFr7QYo1zkge8/0HP2puF7l4/O7ODDmcktfYj1d7owtQFzHZrb2F7umK3M3pneCseWpcrrYm+v3UaBCv+XZpg7dOIYePlFtu4d/enoky995Wv+JA2LtW4shsvaFcRm/xGXRepZ//KhhzaMJPt/ujw2y7/MiPhQNxJscTLXVshiCg17v63bS8xtYu9W+Ma+yERIR2yai0a9ZbcWwmJuear2OoPQ5h2Tk6niK3Zf9jL+RFyzHjN1RGYLjQC2/98U5NHHDu7tDAa/vzw+08FHu+IDnUiM9DdhrgP9Jkykrs17K/aNmds4njPJp9g3MI7njz4NbXFW/zu8ZcfSZFF76a7zfv/YaoBrB7CZDXEBWrGvn/zZY0ODbcl/zYzN7OQghzsTSG7fqH+Q43k/VzjOmuLCkYOophZqmjuy68jk0tJVuy55Ff8alx1Yr6HJRonoQUHz4BYh9ciAtu/i8088dvLYFW3bBn7OBz+KC2mkDo7r/vLzfm79eKmE3NOPQ+N3RqoqwtvOevTR8dHLVxtcHvx9O9XZVHv9r69vv/324u6NA9/c9/sXn1dN57ZWCkWU5lIIxCIIREKWpaPDYf4Byc+FAKaYos3eTXO97B0aKthTOHu/fjXXu3cNfb+aWkT+8G8ZyGyINxhi4O655/986943/dE7/jyL1sD1FfwCbFyTuE08/tfXd/7oR1UlHv32i1/+YkKKlYsZyKQ4n+LvSWS+csJiLmwdL/yO+rmsSS6fOo7C8VHWbFIoiTZNGd5581/98/4PfOiTnxRdIdc7M+rBa9szELQWvED20mR9e/Kppy4JZSr/Uphe6OLjcJzJbds2IBCNuGoupbAxr5Hm2v1cwPva3TW3sb07E+3MRYN4ND5pMH4YVbbm1xfs27CQjrVft2Hvhfz18m6ANhvM8M1iPxrsdQVuGRAza25v2rv34bHC0kVt2wYf4jMj1VwBi08eRe7EDH8FvUNzSUuaS89Yc9FQc21MhH/N5R/BKE4eRZ7pbTW3rH+GLrhl909Hc4WLGLgPY43BNYtgBaEZkx0s5usrrrhCuf2zn307FrKfLC2k9LeJqeEgEls2sGa7Db9Lfi7vHfPmmJZqr44MdvWkK10Dn7jm+o985f77728G7KqAa+R7pYG4bBOXxQH0g3fd1b13ZNtNpen5N1TyBcLBCiZjiA31I5CI4d+zn8s7UXySnj87xI+TcISqA0PfPnjsxIdfdPW182gOrB1guGyvCKQzPb8RyG5gk7Ennrgklq/8Y/n0wojxioNAMo7YYB+C7QkrNom5eE76uRzY0tQkqplUzZ75tsGewbF0rO3PNpz9op9BBq/R2PKqgctDK71or0A8tpuGz3zhCyeCvd1fvvjFF00EFfUcrVROVvMFlBaW2MIYAP5VrxB/wSasZhkOzSUOzSWmPeDUXK/esl8/1/zobqWCMpscKB4/oj+ny+dv+aBFoKv3JO0d+vinv/lP733dW95zHM0BXRNwzSJZheDFZGPdlM033HBD8H1/fN1blXT+w6W5hX6qaWbzGmT6HOntZqxukwq7oebaNXS1NJfFwR/8Ks/PsvUC6t0zEFYJA929M6X27r+9+au3fPVTn7qtDP+sBdYAXOM6ViuQBtu+l8/ecEP4ze9463VqrvCRymJ6oJRK699S5FqnhgIItCcRbEsg0BaHGon40Fy4aCZa0lz+TcBKeolNwi+jzMAlrOfPKyB/9bIST3LGTpejsb/92j9/42vv/dSneK+KtrgYYVXBNQp/tcNK2Oy6TB48eGlbUHlrdSl9VXl+MaqVjO/L1pjFv/YVYGCr8Zj+7T7+FU41GnXJTCONlpnLH83UinnQIgM1m4G2nK71hIkVj8JGoILdvXna3nl3ply5bfCsCx7CykBdE9aKYS0AtsfrBbK43WjBnXfckbjsoguvUXPZN2mF4nnVTCZUWWaDBlQTmKZBqa9VNhzKhwGVgKqzkz/LQ/k6qNaYR2v6yTt2tXUV1UJBf6EJj4/Ho+nxoRavGmBMjbOWo71UDYV+qcWT//Lgz39052ve/B7jpU+tALpu4BoFvFaBeOy7gWvf9/oPN9/8rtA1r3j3Oe2dHRchm3kxyRcuqBaLXZzdWiEPg+W1EzVBQ+VylJlNTc3ln2rlb21VwxG+XkA48iskkj9NZ1I/v+N7X3r8gx+81WpGnMA1ArURsG77qxLWEmC3NLyY3QhoLxtz/fD3vtczNDK0pT0S3sLYukXL5XaSanmjQrU2raLFmVGMsZSPiyY5a5kLk2bcLaiKkqOKkmUiv0yJehLx+GGtUhnLFjLj0xOnxs7/g9cY35l1A6cRwF42aLK96mE9AHZLhzRYt7qNJtuthGYg0BVsu63hsb/qYb0A9kqP+Fg3OuZ2jn27leAFqnjMi832ba843PbXLKw3wF7pNgJsJQC77TcLXiD4AbiRfaM01jz8PwAAAP//lR5d8gAAAAZJREFUAwBOg9z5xzYhEgAAAABJRU5ErkJggg==';

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => i); // 0..23

function parseHour(hm: string): number {
  return parseInt(hm.split(':')[0], 10);
}

export function addMinutesToTime(hm: string, minutes: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function resolveAttractionName(attractionId: string, city: string, opts: ResolvedOptions): string {
  if (opts.attractionNames?.[attractionId]) return opts.attractionNames[attractionId];
  const lastUnderscore = attractionId.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const index = parseInt(attractionId.slice(lastUnderscore + 1), 10);
    if (!isNaN(index)) return fmt(opts.labels.attractionFallback, { city, n: index + 1 });
  }
  return attractionId;
}

export function buildDayRange(stops: TripStop[]): string[] {
  if (!stops.length) return [];
  const end = parseDMY(stops[stops.length - 1].checkOut);
  const days: string[] = [];
  for (let cur = parseDMY(stops[0].checkIn); cur <= end; cur = addDays(cur, 1)) days.push(dateKey(cur));
  return days;
}

/** Index of the stop a day belongs to (check-in ≤ day < check-out; the last stop also owns its check-out day), or -1. */
export function stopIndexForDay(day: string, stops: TripStop[]): number {
  const d = parseDMY(day);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const isLast = i === stops.length - 1;
    if (d >= parseDMY(s.checkIn) && (d < parseDMY(s.checkOut) || (isLast && d <= parseDMY(s.checkOut)))) return i;
  }
  return -1;
}

interface TransitActivity {
  text: string;
  startLabel: string;   // HH:mm departure time of the segment this point belongs to
  endLabel: string;     // HH:mm arrival time of the segment this point belongs to
  name: string;         // e.g. "Vuelo Londres → París", used in collision comments
}

interface PlacedTransitBlock {
  dayIdx: number;
  startHour: number;
  endHour: number; // inclusive
  text: string;
  // Attractions whose own start hour falls inside this block's span get their
  // text attached here instead of becoming an independent PlacedBlock — once
  // ExcelJS merges startHour..endHour into one cell, sheet.getCell() on any
  // row in that range resolves to the same master cell, so a second
  // mergeCells()/value write there would silently clobber this block's text.
  extraLines?: string[];
}

// Same-day departures/arrivals stay as single-hour point markers (pointMap).
// A segment whose arrival date is after its departure date is split into one
// merged block per day it touches: departure hour → 23:00 on the first day,
// a full 00:00–23:00 block on any day fully in between, and 00:00 → arrival
// hour on the last day — so an overnight trip reads as one continuous block
// instead of two disconnected single-hour markers.
function buildTransitData(
  days: string[],
  transits: TransitLeg[],
  opts: ResolvedOptions,
): { pointMap: Map<string, TransitActivity[]>; blocks: PlacedTransitBlock[] } {
  const l = opts.labels;
  const pointMap = new Map<string, TransitActivity[]>();
  const blocks: PlacedTransitBlock[] = [];
  const pushPoint = (dayIdx: number, hour: number, activity: TransitActivity) => {
    const key = `${dayIdx}:${hour}`;
    const list = pointMap.get(key) ?? [];
    list.push(activity);
    pointMap.set(key, list);
  };
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  for (const leg of transits) {
    const fromCity = resolveCityName(leg.fromCityId, l, opts.cityNames);
    const toCity = resolveCityName(leg.toCityId, l, opts.cityNames);
    for (const seg of leg.segments) {
      const mode = modeLabel(l, seg.mode);
      const notes = seg.notes ? ` (${seg.notes})` : '';
      const depIdx = dayIndex.get(seg.departureDate);
      const arrIdx = dayIndex.get(seg.arrivalDate);
      const depHour = Math.max(0, Math.min(23, parseHour(seg.departureTime)));
      const arrHour = Math.max(0, Math.min(23, parseHour(seg.arrivalTime)));
      const departureText = fmt(l.transitDeparts, { time: seg.departureTime, mode, to: toCity }) + notes;
      const arrivalText = fmt(l.transitArrives, { time: seg.arrivalTime, mode, from: fromCity });
      const segmentName = `${mode} ${fromCity} → ${toCity}`;

      if (depIdx !== undefined && arrIdx !== undefined && arrIdx > depIdx) {
        blocks.push({ dayIdx: depIdx, startHour: depHour, endHour: 23, text: departureText });
        for (let d = depIdx + 1; d < arrIdx; d++) {
          blocks.push({ dayIdx: d, startHour: 0, endHour: 23, text: fmt(l.inTransit, { mode }) });
        }
        blocks.push({ dayIdx: arrIdx, startHour: 0, endHour: arrHour, text: arrivalText });
        continue;
      }

      if (depIdx !== undefined) {
        pushPoint(depIdx, depHour, { text: departureText, startLabel: seg.departureTime, endLabel: seg.arrivalTime, name: segmentName });
      }
      if (arrIdx !== undefined) {
        pushPoint(arrIdx, arrHour, { text: arrivalText, startLabel: seg.departureTime, endLabel: seg.arrivalTime, name: segmentName });
      }
    }
  }
  return { pointMap, blocks };
}

interface RawAttractionSpan {
  dayIdx: number;
  startHour: number;
  endHour: number;      // inclusive, before any transit-shrink
  startLabel: string;   // HH:mm
  endLabel: string;     // HH:mm — explicit endTime, or startTime + the estimated visit duration
  name: string;
  ticketNeeded?: boolean;
  bought?: boolean;      // ticket-required and already purchased
  personal?: boolean;    // Feature 71 personal activity
  link?: string;         // Google Maps link for the cell
}

interface PlacedBlock {
  dayIdx: number;
  startHour: number;
  endHour: number;       // inclusive; equals startHour for 'conflict' blocks
  kind: 'solo' | 'conflict';
  text: string;
  ticketNeeded?: boolean;
  bought?: boolean;
  personal?: boolean;
  link?: string;
  comment?: string;
}

function buildRawAttractionSpans(
  days: string[],
  stops: TripStop[],
  transitBlockOwner: Map<string, PlacedTransitBlock>,
  opts: ResolvedOptions,
): RawAttractionSpan[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const raw: RawAttractionSpan[] = [];

  for (const stop of stops) {
    const cityName = resolveCityName(stop.cityId, opts.labels, opts.cityNames);
    for (const att of stop.selectedAttractions) {
      const attDay = att.date ?? stop.checkIn;
      const dayIdx = dayIndex.get(attDay);
      if (dayIdx === undefined || !att.startTime) continue;
      const startHour = Math.max(0, Math.min(23, parseHour(att.startTime)));
      const name = att.activityType
        ? (att.title ?? '')                                   // Feature 71 — personal activity, stored title
        : resolveAttractionName(att.attractionId!, cityName, opts);
      const ticketRequired = !!att.attractionId && opts.ticketRequired.has(att.attractionId);
      const ticketNeeded = ticketRequired && !att.ticketPurchased;
      const bought = ticketRequired && !!att.ticketPurchased;
      const link = att.activityType
        ? att.mapsUrl
        : googleMapsSearchUrl(`${opts.details.attractionDetails?.[att.attractionId!]?.nativeName ?? name}, ${cityName}`);

      // The attraction's own start hour already sits inside a merged overnight
      // transit block — there is no independent cell left to place it in, so
      // attach it to that block's text instead of creating a conflicting block.
      const owner = transitBlockOwner.get(`${dayIdx}:${startHour}`);
      if (owner) {
        owner.extraLines = owner.extraLines ?? [];
        owner.extraLines.push(`${ticketNeeded ? '🎟️ ' : ''}${bought ? '✅ ' : ''}${att.startTime} ${name}`);
        continue;
      }

      const defaultMinutes = (att.attractionId ? opts.attractionDurations?.[att.attractionId] : undefined) ?? 60;
      const defaultHours = Math.max(1, Math.ceil(defaultMinutes / 60));
      const rawEndHour = att.endTime ? parseHour(att.endTime) : startHour + defaultHours;
      const endHour = Math.min(23, Math.max(startHour, rawEndHour - 1));
      // No explicit endTime — fall back to the curated visit-duration estimate
      // so the collision comment still shows a real end time instead of none.
      const endLabel = att.endTime ?? addMinutesToTime(att.startTime, defaultMinutes);
      raw.push({ dayIdx, startHour, endHour, startLabel: att.startTime, endLabel, name, ticketNeeded, bought, personal: !!att.activityType, link });
    }
  }
  return raw;
}

// Groups, per day, any spans whose hour ranges transitively overlap.
function clusterOverlappingSpans(spans: RawAttractionSpan[]): RawAttractionSpan[][] {
  const byDay = new Map<number, RawAttractionSpan[]>();
  for (const span of spans) {
    const list = byDay.get(span.dayIdx) ?? [];
    list.push(span);
    byDay.set(span.dayIdx, list);
  }

  const clusters: RawAttractionSpan[][] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startHour - b.startHour);
    let current: RawAttractionSpan[] = [];
    let currentEnd = -1;
    for (const span of list) {
      if (current.length === 0 || span.startHour > currentEnd) {
        if (current.length) clusters.push(current);
        current = [span];
        currentEnd = span.endHour;
      } else {
        current.push(span);
        currentEnd = Math.max(currentEnd, span.endHour);
      }
    }
    if (current.length) clusters.push(current);
  }
  return clusters;
}

function buildAttractionBlocks(
  days: string[],
  stops: TripStop[],
  transitOccupied: Set<string>,
  transitBlockOwner: Map<string, PlacedTransitBlock>,
  transitPointMap: Map<string, TransitActivity[]>,
  opts: ResolvedOptions,
): PlacedBlock[] {
  const raw = buildRawAttractionSpans(days, stops, transitBlockOwner, opts);
  const clusters = clusterOverlappingSpans(raw);
  const blocks: PlacedBlock[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const [span] = cluster;
      // Shrink the merge range so it never overwrites an hour a transit event occupies.
      let endHour = span.startHour;
      for (let h = span.startHour + 1; h <= span.endHour; h++) {
        if (transitOccupied.has(`${span.dayIdx}:${h}`)) break;
        endHour = h;
      }
      blocks.push({
        dayIdx: span.dayIdx, startHour: span.startHour, endHour,
        kind: 'solo',
        text: `${span.startLabel} ${span.name}`,
        ticketNeeded: span.ticketNeeded,
        bought: span.bought,
        personal: span.personal,
        link: span.link,
      });
    } else {
      const minStartHour = Math.min(...cluster.map(s => s.startHour));
      // The warning cell also stacks any transit point (flight/train/etc.)
      // landing on this exact hour — list its full departure–arrival range
      // in the comment too, not just the attractions, so the tooltip
      // explains every item actually shown in the cell.
      const collidingPoints = transitPointMap.get(`${cluster[0].dayIdx}:${minStartHour}`) ?? [];
      const comment = [
        ...cluster.map(s => `${s.startLabel}${s.endLabel ? '–' + s.endLabel : ''} ${s.name}`),
        ...collidingPoints.map(p => `${p.startLabel}–${p.endLabel} ${p.name}`),
      ].join('\n');
      blocks.push({
        dayIdx: cluster[0].dayIdx, startHour: minStartHour, endHour: minStartHour,
        kind: 'conflict',
        text: fmt(opts.labels.overlap, { n: cluster.length }),
        comment,
      });
    }
  }
  return blocks;
}

export function buildItinerarioSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l: ItineraryLabels = opts.labels;
  const { title, stops, transits } = trip;

  const days = buildDayRange(stops);
  const totalCols = days.length + 1;
  const { pointMap: transitPointMap, blocks: transitBlocks } = buildTransitData(days, transits, opts);
  const transitOccupied = new Set<string>(transitPointMap.keys());
  const transitBlockByStartCell = new Map<string, PlacedTransitBlock>();
  const transitBlockCoveredCells = new Set<string>();
  const transitBlockOwner = new Map<string, PlacedTransitBlock>();
  for (const block of transitBlocks) {
    transitBlockByStartCell.set(`${block.dayIdx}:${block.startHour}`, block);
    for (let h = block.startHour; h <= block.endHour; h++) {
      const key = `${block.dayIdx}:${h}`;
      transitOccupied.add(key);
      transitBlockCoveredCells.add(key);
      transitBlockOwner.set(key, block);
    }
  }
  const attractionBlocks = buildAttractionBlocks(days, stops, transitOccupied, transitBlockOwner, transitPointMap, opts);
  const blockByStartCell = new Map<string, PlacedBlock>();
  const blockCoveredCells = new Set<string>();
  for (const block of attractionBlocks) {
    blockByStartCell.set(`${block.dayIdx}:${block.startHour}`, block);
    if (block.kind === 'solo') {
      for (let h = block.startHour; h <= block.endHour; h++) blockCoveredCells.add(`${block.dayIdx}:${h}`);
    }
  }

  const sheet = workbook.addWorksheet(l.sheetItinerario);

  sheet.getColumn(1).width = 10;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 18;

  // --- Row 1: Title header (site --lav background, logo overlaid) ---
  sheet.getRow(1).height = 56;
  sheet.getCell(1, 1).fill = fill(C.headBg); // A1 gets just the background — logo floats on top
  const titleCell = sheet.getCell(1, 2);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: C.headText }, name: 'Calibri' };
  titleCell.fill = fill(C.headBg);
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  if (totalCols > 2) sheet.mergeCells(1, 2, 1, totalCols);

  const logoId = workbook.addImage({ base64: LOGO_PNG_BASE64, extension: 'png' });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 56, height: 56 } });

  // --- Row 2: Branding subtitle ---
  sheet.getRow(2).height = 20;
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = l.subtitle;
  subtitleCell.font = { italic: true, size: 10, color: { argb: C.lavD }, name: 'Calibri' };
  subtitleCell.fill = fill(C.lav);
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  if (totalCols > 1) sheet.mergeCells(2, 1, 2, totalCols);

  // --- Row 3: Spacer ---
  sheet.getRow(3).height = 6;

  // --- Row 4: Date column headers ---
  sheet.getRow(4).height = 22;
  const headerLabelCell = sheet.getCell(4, 1);
  headerLabelCell.value = l.gridCorner;
  applyHeaderStyle(headerLabelCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(4, i + 2);
    cell.value = shortDate(day);
    applyHeaderStyle(cell);
  });

  // --- Row 5: City names ---
  sheet.getRow(5).height = 20;
  applyCityStyle(sheet.getCell(5, 1));
  days.forEach((day, i) => {
    const cell = sheet.getCell(5, i + 2);
    const stopIdx = stopIndexForDay(day, stops);
    const city = stopIdx === -1 ? '' : resolveCityName(stops[stopIdx].cityId, l, opts.cityNames);
    const w = opts.context.weather[String(stopIdx)]?.find(d => d.date === day);
    if (w && w.type !== 'unavailable' && w.tempMaxC !== undefined && w.tempMinC !== undefined) {
      const { icon } = weatherCodeLabel(w.weatherCode, opts.locale);
      cell.value = `${city}\n${icon} ${Math.round(w.tempMaxC)}° / ${Math.round(w.tempMinC)}°`;
      sheet.getRow(5).height = 32;
    } else {
      cell.value = city;
    }
    applyCityStyle(cell);
  });

  // --- Rows 6+: Time slots ---
  TIME_SLOTS.forEach((hour, rowOffset) => {
    const rowNum = 6 + rowOffset;
    sheet.getRow(rowNum).height = 35;

    const timeCell = sheet.getCell(rowNum, 1);
    timeCell.value = `${String(hour).padStart(2, '0')}:00`;
    applyTimeSlotStyle(timeCell);

    days.forEach((_, dayIdx) => {
      const key = `${dayIdx}:${hour}`;
      const col = dayIdx + 2;
      const cell = sheet.getCell(rowNum, col);
      const block = blockByStartCell.get(key);
      const transitBlock = transitBlockByStartCell.get(key);
      const pointActivities = transitPointMap.get(key) ?? [];

      if (block || transitBlock) {
        const lines = pointActivities.map(a => a.text);
        if (transitBlock) {
          lines.push(transitBlock.text);
          if (transitBlock.extraLines) lines.push(...transitBlock.extraLines);
        }
        if (block) {
          const prefix = block.kind === 'conflict' ? '' : (block.ticketNeeded ? '🎟️ ' : '');
          lines.push(prefix + block.text);
          if (block.bought) lines.push(l.ticketBought);
        }
        const text = lines.join('\n');
        // Link only when the cell holds just this one attraction/activity.
        const link = !transitBlock && pointActivities.length === 0 ? block?.link : undefined;
        cell.value = link ? { text, hyperlink: link } : text;
        if (block?.comment) cell.note = block.comment;

        const mergeEndOffset = Math.max(
          block?.kind === 'solo' ? block.endHour - block.startHour : 0,
          transitBlock ? transitBlock.endHour - transitBlock.startHour : 0,
        );
        if (mergeEndOffset > 0) sheet.mergeCells(rowNum, col, rowNum + mergeEndOffset, col);

        const style: ActivityStyle =
          pointActivities.length || transitBlock ? 'transit' :
          block?.kind === 'conflict' ? 'conflict' :
          block?.personal ? 'personal' :
          block?.ticketNeeded ? 'ticket' : 'attraction';
        applyActivityStyle(cell, style);
        return;
      }
      if (blockCoveredCells.has(key) || transitBlockCoveredCells.has(key)) {
        return; // continuation row of a merged block above
      }

      if (pointActivities.length === 0) {
        applyActivityStyle(cell, 'empty');
      } else {
        cell.value = pointActivities.map(a => a.text).join('\n');
        applyActivityStyle(cell, 'transit');
      }
    });
  });

  // --- Legend (one blank spacer row below the last hour row) ---
  const legendStartRow = 6 + TIME_SLOTS.length + 1;
  const legendRows: Array<{ color: string; label: string }> = [
    { color: C.peach,  label: l.legendTicket },
    { color: C.mint,   label: l.legendAttraction },
    { color: C.lav,    label: l.legendTransit },
    { color: C.blush,  label: l.legendOverlap },
    { color: C.butter, label: l.legendPersonal },
    { color: C.mint,   label: l.ticketBought },
  ];
  legendRows.forEach((entry, i) => {
    const rowNum = legendStartRow + i;
    const swatch = sheet.getCell(rowNum, 1);
    swatch.fill = fill(entry.color);
    swatch.border = border();
    const label = sheet.getCell(rowNum, 2);
    label.value = entry.label;
    label.font = { size: 10, color: { argb: C.t1 }, name: 'Calibri' };
    label.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  freezeHeader(sheet, 5, 1);
  sheet.pageSetup.orientation = 'landscape';
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
}
