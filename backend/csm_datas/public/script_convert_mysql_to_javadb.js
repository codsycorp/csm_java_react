var optionMenu=[];
function updateMenu(optionConfig)
      {
        var upsArr=[];
        upsArr.push(optionConfig);
        const newArr = optionMenu.map((a, index) => {
          const nodes =(!a.hasOwnProperty("nodes")?[]:a.nodes).map((b, i) => {
            return upsArr.find(o => o.id === b.id) || b;
          })
          return { ...a, nodes };
        })
        optionMenu=newArr;
      }
function addNewMenu(menu_parent,newMN){
    if(newMN)
    {   
        newMN=Object.assign(newMN,JSON.parse(JSON.stringify(newMN.menu)));
        newMN["label"]=newMN.grid_name;
        newMN["m_icons"]=newMN["m_icon"];
        delete newMN["menu"];
        delete newMN["m_icon"];
        delete newMN["parent_id"];
        delete newMN["grid_name"];
    }
    if(!menu_parent)
          {
            var newID=guid("");
            optionMenu.push(newMN||{id:newID});
            var optionConfig=findOption(optionMenu,newID);
          }
          else
          {
            var  optionConfig=findOption(optionMenu,menu_parent);
            var newC=newMN||JSON.parse(JSON.stringify(optionConfig));
            if(!optionConfig.hasOwnProperty("nodes"))
              optionConfig["nodes"]=[];
            newC.id=guid("");
            //newC.label="Tên menu mới";
            delete newC["nodes"];
            optionConfig["nodes"].push(newC);
            updateMenu(optionConfig);
            optionConfig=findOption(optionMenu,newC.id);
          }
}
function getAllMenu(arr = [], parent_id){
        var seft=this;
        return arr.reduce((list, { nodes, ...e }) => {
          list.push(parent_id ? {...e,parent_id:parent_id} : e);
          if(nodes) list.push(...getAllMenu(nodes, e.label));
          return list;
        }, []);
      }
function findOption(arrayR,id){
        var result;
        arrayR.some(o => result = o.id === id ? o : findOption(o.nodes || [], id));
        return result;
      }
function guid(tbl_prefix_pk)
      {
          var time_id=dateFormat(new Date(),"yymmddhhMMss");
          function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
              .toString(16)
              .substring(1);
          }
          return (tbl_prefix_pk!=""?tbl_prefix_pk+"_":"")+time_id+"_" + s4() + s4() + s4();
      }
codsy_obj_tables("#dbsys#sys_apps",{$or:[{app_id:'sxtp'},{app_id:'quanlyphattu'},{app_id:'xekhach'}]},[['app_id',"id"], ['app_name',"name"], ['option_config',"menu"]],false,function(msg){
    msg.forEach(function(obj){
        window[obj.id]=JSON.parse(Base64.decode(obj.menu));
    })
});
quanlyphattu.filter((m)=>m.parent_id==="quanlyphattu").forEach(function(o){
    addNewMenu(null,o);
    quanlyphattu.filter((m)=>m.parent_id===o.id).forEach(function(oC){
        addNewMenu(o.id,oC);
        quanlyphattu.filter((m)=>m.parent_id===oC.id).forEach(function(oC1){
            addNewMenu(oC.id,oC1)
        });
    });
})
socketJV.emit("codsy_obj_tables",{app_id:"csm",obj_name:"struct",e_where:'eq("id","quanlyphattu")'},function(msg){
    var info=msg.rows.length>0?msg.rows[0]:{id:'quanlyphattu',p_code:'',optionMenu:''};
            info["optionMenu"]=strtr(Base64.encode(JSON.stringify(optionMenu)),phone+writeby,writeby+phone);
            socketJV.emit("codsy_obj_update",{app_id:"csm",obj_name:"struct",obj_update:info,command:(msg.rows.length>0?"update":"create"),e_where:'eq("id","quanlyphattu")'},function(msgU){
              alert("Đã lưu lại thông tin Menu");
            }); 
        });
optionMenu=[];
sxtp.filter((m)=>m.parent_id==="sxtp").forEach(function(o){
    addNewMenu(null,o);
    sxtp.filter((m)=>m.parent_id===o.id).forEach(function(oC){
        addNewMenu(o.id,oC);
        sxtp.filter((m)=>m.parent_id===oC.id).forEach(function(oC1){
            addNewMenu(oC.id,oC1)
        });
    });
});
socketJV.emit("codsy_obj_tables",{app_id:"csm",obj_name:"struct",e_where:'eq("id","sxtp")'},function(msg){
          var info=msg.rows.length>0?msg.rows[0]:{id:'sxtp',p_code:'',optionMenu:''};
            info["optionMenu"]=strtr(Base64.encode(JSON.stringify(optionMenu)),phone+writeby,writeby+phone);
            socketJV.emit("codsy_obj_update",{app_id:"csm",obj_name:"struct",obj_update:info,command:(msg.rows.length>0?"update":"create"),e_where:'eq("id","sxtp")'},function(msgU){
              alert("Đã lưu lại thông tin Menu");
            }); 
        });