// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

const {ccclass, property} = cc._decorator;
@ccclass
export default class Slice extends cc.Component 
{
    @property(cc.Node)
    gameLayer:cc.Node = null;

    private factor:number = 30;
    //必须写进onLoad里
    onLoad () {
        this.initPhysics();
    }

    start() {
        this.initEvent();
    }

    /**
     * 初始化物理引擎
     */
    private initPhysics():void
    {
        let manager:cc.PhysicsManager = cc.director.getPhysicsManager()
        manager.enabled = true;
        manager.gravity = new cc.Vec2(0, -50 * this.factor);
        // manager.debugDrawFlags = cc.PhysicsManager.DrawBits.e_shapeBit;
        manager.enabledAccumulator = true;
        // 物理步长，默认 FIXED_TIME_STEP 是 1/60
        cc.PhysicsManager.FIXED_TIME_STEP = 1 / 60;
        // 每次更新物理系统处理速度的迭代次数，默认为 10
        cc.PhysicsManager.VELOCITY_ITERATIONS = 10;
        // 每次更新物理系统处理位置的迭代次数，默认为 10
        cc.PhysicsManager.POSITION_ITERATIONS = 10;
    }

    private initEvent() 
    {
        const ctx = this.getComponent(cc.Graphics);
        this.node.on(cc.Node.EventType.TOUCH_MOVE, (event:any) => {
            ctx.clear();
            const startPoint = event.getStartLocation();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(event.getLocationX(), event.getLocationY());
            ctx.stroke();
        }, this);    

        this.node.on(cc.Node.EventType.TOUCH_END, (event:any) => {
            ctx.clear();
            const p1:cc.Vec2 = event.getStartLocation();
            const p2:cc.Vec2 = event.getLocation();
            // 核心逻辑
            this.cut(p1, p2);
        }, this);
    }

    /**
     * 切割
     * @param point1 起始点
     * @param point2 结束点 
     */
    private cut(point1:cc.Vec2, point2:cc.Vec2):void
    {
        const result1:cc.PhysicsRayCastResult[] = cc.director.getPhysicsManager().rayCast(point1, point2, cc.RayCastType.All);
        const result2:cc.PhysicsRayCastResult[] = cc.director.getPhysicsManager().rayCast(point2, point1, cc.RayCastType.All);
        // 将结果二的方向反过来
        result2.forEach(r => {
            r.fraction = 1 - r.fraction;
        });
        // 将结果合并
        const results:cc.PhysicsRayCastResult[] = result1.concat(result2);
        // 然后我们将结果进行分类
        let pairs:cc.PhysicsRayCastResult[][] = [];
        for (let i:number = 0; i < results.length; i++) {
            let find:boolean = false;
            let result:cc.PhysicsRayCastResult = results[i];
            if(!(result.collider instanceof cc.PhysicsPolygonCollider)) continue;
            for (let j:number = 0; j < pairs.length; j++) {
                let pair:cc.PhysicsRayCastResult[] = pairs[j];
                // 以第一个点为参考，如果碰撞盒子是同一个，证明是同一个物体
                if (pair[0] && result.collider === pair[0].collider) {
                    find = true;
                    // 移除同碰撞体内部的多余的点，因为两个结果，只有内部的点是重叠的，找相同的点
                    let r:cc.PhysicsRayCastResult = pair.find((r) => {
                        // 物理世界没有绝对相等，官方取的判断临界是根号 5，很小的距离来判断点在同一位置
                        return r.point.sub(result.point).magSqr() <= 5;
                    });
                    // 如果有非常近的点，跳过 push，然后把里面的删去
                    if (r) {
                        pair.splice(pair.indexOf(r), 1);
                    }
                    else { 
                        pair.push(result);
                    }
                    break;
                }
            }
            if (!find) {
                pairs.push([result]);
            }
        }
        cc.log(pairs);

        for (let i:number = 0; i < pairs.length; i++) {
            let pair:cc.PhysicsRayCastResult[] = pairs[i];
            if (pair.length < 2) {
                continue;
            }
            // 根据远近，按顺序排队，这样每两个一组
            pair = pair.sort((a, b) => {
                if (a.fraction > b.fraction) {
                    return 1;
                } else if (a.fraction < b.fraction) {
                    return -1;
                }
                return 0;
            });
            cc.log(pair)
            // 将一个碰撞体上的所有点分成几个部分，比如两个交点就是两部分，四个交点就需要分成三部分
            let splitResults:any[] = [];
            // 每两个点一循环
            for (let j:number = 0; j < pair.length - 1; j += 2) {
                let r1:cc.PhysicsRayCastResult = pair[j];
                let r2:cc.PhysicsRayCastResult = pair[j + 1];
                if (r1 && r2) {
                    // 封装一个方法，将分割后的结果放入 splitResults 中
                    this.split(<cc.PhysicsPolygonCollider>r1.collider, r1.point, r2.point, splitResults);
                }
            }
            if (splitResults.length <= 0) {
                continue;
            }
            // 根据结果创建碰撞体
            let collider:cc.PhysicsPolygonCollider = pair[0].collider as cc.PhysicsPolygonCollider;
            let maxPointsResult:cc.Vec2[];
            for (let j:number = 0; j < splitResults.length; j++) {
                let splitResult:any = splitResults[j];
                for (let k:number = 0; k < splitResult.length; k++) {
                    if (typeof splitResult[k] === 'number') {
                        splitResult[k] = collider.points[splitResult[k]];
                    }
                }
                if (!maxPointsResult || splitResult.length > maxPointsResult.length) {
                    maxPointsResult = splitResult;
                }
            }
            // 分割结果不构成图形
            if (maxPointsResult.length < 3) {
                continue;
            }
            // 设置本体
            collider.points = maxPointsResult;
            collider.apply();
            const meshComp = collider.node.getComponent("mesh-texture-mask");
            meshComp.vertexes = maxPointsResult;

            // 克隆 N 个
            for (let j:number = 0; j < splitResults.length; j++) {
                let splitResult:any = splitResults[j];
                if (splitResult.length < 3) continue;
                if (splitResult == maxPointsResult) continue;
                // 克隆本体作为第 N 个
                const cloneNode:cc.Node = cc.instantiate(collider.node);
                this.gameLayer.addChild(cloneNode);
                const comp:cc.PhysicsPolygonCollider = cloneNode.getComponent(cc.PhysicsPolygonCollider);
                comp.points = splitResult;
                comp.apply();

                const cloneMeshComp = cloneNode.getComponent("mesh-texture-mask");
                cloneMeshComp.vertexes = splitResult;
                cloneMeshComp.onLoad();
            }
            
        }
    }

    /** 近似判断点在线上 */
    private pointInLine (point:cc.Vec2, start:cc.Vec2, end:cc.Vec2):boolean {
        const dis:number = 1;
        return cc.Intersection.pointLineDistance(point, start, end, true) < dis;
    }

    /**
     * 
     * @param collider 碰撞对象
     * @param point1 碰撞点1
     * @param point2 碰撞点2
     * @param splitResults 切割后的多边形顶点数组 
     */
    private split (collider:cc.PhysicsPolygonCollider, point1:cc.Vec2, point2:cc.Vec2, splitResults:any[]) 
    {
        let body:cc.RigidBody = collider.body;
        let points:cc.Vec2[] = collider.points;
        // 转化为本地坐标
        let localPoint1:cc.Vec2 = cc.Vec2.ZERO;
        let localPoint2:cc.Vec2 = cc.Vec2.ZERO;
        body.getLocalPoint(point1, localPoint1);
        body.getLocalPoint(point2, localPoint2);
        let newSplitResult1:cc.Vec2[] = [localPoint1, localPoint2];
        let newSplitResult2:cc.Vec2[] = [localPoint2, localPoint1];
        // 同教程第一部分，寻找下标
        let index1:number = undefined;
        let index2:number = undefined;
        for (let i:number = 0; i < points.length; i++) {
            let p1:cc.Vec2 = points[i];
            let p2:cc.Vec2 = i === points.length - 1 ? points[0] : points[i + 1];
            if (this.pointInLine(localPoint1, p1, p2)) {
                index1 = i;
            }
            if (this.pointInLine(localPoint2, p1, p2)) {
                index2 = i;
            }
            if (index1 !== undefined && index2 !== undefined) {
                break;
            }
        }
        // cc.log(`点1下标${index1}`);
        // cc.log(`点2下标${index2}`);
        let splitResult:any[] = undefined;
        let indiceIndex1:number = index1;
        let indiceIndex2:number = index2;
        // 检测重叠部分
        if (splitResults.length > 0) {
            for (let i:number = 0; i < splitResults.length; i++) {
                let indices:any = splitResults[i];
                indiceIndex1 = indices.indexOf(index1);
                indiceIndex2 = indices.indexOf(index2);
                if (indiceIndex1 !== -1 && indiceIndex2 !== -1) {
                    splitResult = splitResults.splice(i, 1)[0];
                    break;
                }
            }
        }
        // 如果没有重叠
        if (!splitResult) {
            splitResult = points.map((p, i) => {
                return i;
            });
        }
        // 分割开两部分
        for (let i:number = indiceIndex1 + 1; i !== (indiceIndex2+1); i++) {
            if (i >= splitResult.length) {
                i = 0;
            }
            let p:any = splitResult[i];
            // 如果是下标，读数组
            p = typeof p === 'number' ? points[p] : p;
            if (p.sub(localPoint1).magSqr() < 5 || p.sub(localPoint2).magSqr() < 5) {
                continue;
            }
            newSplitResult2.push(splitResult[i]);
        }
        for (let i:number = indiceIndex2 + 1; i !== indiceIndex1+1; i++) {
            if (i >= splitResult.length) {
                i = 0;
            }
            let p:any = splitResult[i];
            p = typeof p === 'number' ? points[p] : p;
            if (p.sub(localPoint1).magSqr() < 5 || p.sub(localPoint2).magSqr() < 5) {
                continue;
            }
            newSplitResult1.push(splitResult[i]);
        }
        // 两个方向遍历完毕，装入结果
        splitResults.push(newSplitResult1);
        splitResults.push(newSplitResult2);
    }
}
