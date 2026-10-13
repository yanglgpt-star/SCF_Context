function shuffle(list) { const copy=list.slice(); for(let i=copy.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]} return copy }
const device = require('../../services/device-profile')
function options(answer){const pool=Array.from({length:10},(_,i)=>i+2).filter(n=>n!==answer).sort((a,b)=>Math.abs(a-answer)-Math.abs(b-answer));return shuffle([answer,pool[0],pool[1]])}
Page({
  data:{round:1,total:5,left:1,right:1,leftFace:'⚀',rightFace:'⚀',rolling:false,showAnswers:false,options:[],feedback:'点一下大按钮，掷出两个骰子',completed:false,deviceType:'phone'},
  faces:['⚀','⚁','⚂','⚃','⚄'],
  onLoad(){this.setData({deviceType:device.current().type})},
  roll(){if(this.data.rolling)return;this.setData({rolling:true,showAnswers:false,feedback:'骰子正在滚动…'});let ticks=0;this.rollTimer=setInterval(()=>{const left=Math.floor(Math.random()*5)+1,right=Math.floor(Math.random()*5)+1;this.setData({leftFace:this.faces[left-1],rightFace:this.faces[right-1]});ticks+=1;if(ticks>=7){clearInterval(this.rollTimer);this.answer=left+right;this.setData({left,right,leftFace:this.faces[left-1],rightFace:this.faces[right-1],rolling:false,showAnswers:true,options:options(this.answer),feedback:'数一数，两个骰子合起来是几？'})}},100)},
  choose(e){const value=Number(e.currentTarget.dataset.value);if(value===this.answer){this.setData({feedback:'太棒啦，两个点数合起来数对了！',showAnswers:false});this.nextTimer=setTimeout(()=>this.next(),1000)}else this.setData({feedback:'再分别数一数两个骰子吧'})},
  next(){if(this.data.round>=this.data.total){this.setData({completed:true});return}this.setData({round:this.data.round+1,leftFace:'⚀',rightFace:'⚀',feedback:'再掷一次骰子吧',showAnswers:false})},
  back(){wx.navigateBack()},home(){wx.reLaunch({url:'/pages/index/index'})},again(){this.setData({round:1,completed:false,leftFace:'⚀',rightFace:'⚀',feedback:'点一下大按钮，掷出两个骰子'})},
  onUnload(){clearInterval(this.rollTimer);clearTimeout(this.nextTimer)}
})
