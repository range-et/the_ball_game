export const W=600, R=8;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function generate(level,seed,columns=8){
 const rand=random(seed+level*7919), cols=clamp(columns,5,12), rows=Math.min(4+Math.floor((level-1)/3),8), gap=10, bw=(W-64-(cols-1)*gap)/cols;const bricks=[];
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const pattern=(level-1)%5;
  if(level>1&&((pattern===1&&row%2===1&&col===Math.floor(cols/2))||(pattern===2&&(row+col)%5===0)||(pattern===3&&row===0&&(col<2||col>cols-3))||(pattern===4&&row%2===1&&col%3===0)))continue;
  // Solid bricks are isolated with open neighboring columns: they never form a sealed shell.
  const solid=level>=4&&row===Math.floor(rows/2)&&col%3===1;
  const core=level>=3&&!solid&&row===1&&col===Math.floor(cols/2);
  const hp=solid?1:core?2:level<3?1:1+Math.floor(rand()*Math.min(3,1+level/8));
  bricks.push({id:row*cols+col,x:32+col*(bw+gap),y:.105+row*.043,w:bw,h:.031,hp,maxHp:hp,type:solid?'solid':core?'core':'normal',color:row%3,drop:!solid&&(rand()<.14||level===1&&row===2&&col===Math.floor(cols/2))?['wide','slow','multi','shield','pierce','sticky'][Math.floor(rand()*6)]:null});
 }return bricks;
}
export function circleRect(ball,rect){
 const nx=clamp(ball.x,rect.x,rect.x+rect.w),ny=clamp(ball.y,rect.y,rect.y+rect.h);let dx=ball.x-nx,dy=ball.y-ny;const d=Math.hypot(dx,dy);if(d>=R)return null;
 if(d>0)return{x:dx/d,y:dy/d,depth:R-d};
 const sides=[{v:ball.x-rect.x,x:-1,y:0},{v:rect.x+rect.w-ball.x,x:1,y:0},{v:ball.y-rect.y,x:0,y:-1},{v:rect.y+rect.h-ball.y,x:0,y:1}].sort((a,b)=>a.v-b.v);return{...sides[0],depth:R+sides[0].v};
}
export function reflect(ball,normal){const dot=ball.vx*normal.x+ball.vy*normal.y;if(dot<0){ball.vx-=2*dot*normal.x;ball.vy-=2*dot*normal.y}}
export function validSave(s){return s&&s.version===1&&Number.isInteger(s.level)&&s.level>0&&s.level<1e9&&Number.isFinite(s.seed)&&Number.isFinite(s.score)&&Number.isInteger(s.lives)&&s.lives>=0&&s.lives<=5&&Array.isArray(s.bricks)&&s.bricks.length>0&&s.bricks.length<=200&&s.bricks.every(b=>Number.isFinite(b.x)&&b.x>=0&&Number.isFinite(b.y)&&b.y>=0&&b.y<.7&&Number.isFinite(b.w)&&b.w>0&&b.w<W&&Number.isFinite(b.h)&&b.h>0&&b.h<.1&&Number.isInteger(b.hp)&&b.hp>=0&&b.hp<=10&&['normal','core','solid'].includes(b.type))}
