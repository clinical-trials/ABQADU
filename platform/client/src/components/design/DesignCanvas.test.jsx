import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import DesignCanvas from './DesignCanvas';
let mockStage;
jest.mock('react-konva',()=>{
 const React=require('react');
 const Box=({children})=><div>{children}</div>;
 return { Stage:React.forwardRef((props,ref)=>{mockStage=props;return <div data-stage="true">{props.children}</div>;}),Layer:Box,Group:Box,Rect:()=>null,Text:()=>null,Line:()=>null,Transformer:()=>null };
});
let host,root,resize;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;global.ResizeObserver=class{constructor(fn){resize=fn;}observe(){this.fn;}disconnect(){}};jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:320,height:400});host=document.createElement('div');root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());jest.restoreAllMocks();delete global.ResizeObserver;});
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
test('fit and zoom change the viewport without changing room measurements',async()=>{
 const onMove=jest.fn(),onResize=jest.fn();
 await act(async()=>root.render(<DesignCanvas rooms={[]} tool="select" onMove={onMove} onResize={onResize}/>));
 expect(button('Fit plan')).toBeDefined();
 expect(mockStage.width).toBe(320);
 expect(mockStage.scaleX).toBeLessThan(1);
 const initial=mockStage.scaleX;
 await act(async()=>button('Zoom in').click());
 expect(mockStage.scaleX).toBeGreaterThan(initial);
 await act(async()=>button('Fit plan').click());
 expect(mockStage.scaleX).toBe(initial);
 expect(onMove).not.toHaveBeenCalled();expect(onResize).not.toHaveBeenCalled();
});
test('move-view mode enables stage panning and ignores room-placement taps',async()=>{
 const onAddRoom=jest.fn();await act(async()=>root.render(<DesignCanvas rooms={[]} tool="Bedroom" onAddRoom={onAddRoom}/>));
 await act(async()=>button('Move view').click());
 expect(mockStage.draggable).toBe(true);
 await act(async()=>mockStage.onPointerClick({}));
 expect(onAddRoom).not.toHaveBeenCalled();
});
