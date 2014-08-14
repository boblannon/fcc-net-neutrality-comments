(function($) {
    var stylesXHR = $.getJSON('styles.json');
    var dataXHR = $.getJSON('tree.json');

    $.when(stylesXHR, dataXHR).done(function(stylesResult, dataResult) {
        styles = stylesResult[0];
        data = dataResult[0];

        var $svg = $('svg');

        var margin = 20,
            width = $svg.width(),
            height = $svg.height();

        var diameter = Math.min(height, width);

        var color = d3.scale.linear()
            .domain([1, 3])
            .range([styles.colors.data.main.yellow.subsets[0].hex, styles.colors.data.main.yellow.subsets[1].hex])
            .interpolate(d3.interpolateHcl);

        var pack = d3.layout.pack()
            .padding(2)
            .size([width, height])
            .value(function(d) { return d.size; })

        var svg = d3.select($svg[0])
            .append("g")
                .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")")
                .attr('class', 'main');

        var annotations = d3.select($svg[0])
            .append("g");

        var root = {'children': data, 'size': $.map(data, function(el) { return el.size; }).reduce(function(a, b) { return a + b; }, 0)};

        var focus = root,
            nodes = pack.nodes(root),
            view;

        var circle = svg.selectAll("circle")
            .data(nodes)
          .enter().append("circle")
            .attr('id', function(d) { return d.id ? 'circle-' + d.id : null; })
            .attr("class", function(d) { return d.parent ? d.children ? "node" : "node node--leaf" : "node node--root"; })
            .style("fill", function(d) { return d.parent ? color(d.depth) : "none"; })
            .style("pointer-events", function(d) { return d.parent ? "auto" : "none"})
            .on("click", function(d) { if (focus !== d) zoom(d), d3.event.stopPropagation(); });

        var text = svg.selectAll("text")
            .data(nodes)
            .enter()
                .append("g")
                    .attr("class", "label-group")
                    .each(function(d, i) {
                        d3.select(this)
                            .append("text")
                            .attr("class", "label")
                            .style("fill-opacity", function(d) { return d.parent === root ? 1 : 0; })
                            .style("display", function(d) { return d.parent === root ? "inline" : "none"; })
                            .style('pointer-events', 'none')
                            .style('text-anchor', 'middle')
                            .style('text-shadow', '0 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 -1px 0 #fff')
                            .text(function(d) { return d.keywords ? d.keywords.slice(0,3).join(", ") : ""; })
                            .attr('fill', '#333');
                        d3.select(this)
                            .append("text")
                            .attr("class", "label")
                            .style("fill-opacity", function(d) { return d.parent === root ? 1 : 0; })
                            .style("display", function(d) { return d.parent === root ? "inline" : "none"; })
                            .style('pointer-events', 'none')
                            .style('text-anchor', 'middle')
                            .style('text-shadow', '0 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 -1px 0 #fff')
                            .style("baseline-shift", "-100%")
                            .text(function(d) { return d.keywords ? d.keywords.slice(3,5).join(", ") : ""; })
                            .attr('fill', '#333');
                    })


        /* titles and annotations */
        var title = annotations.append("text")
            .text("")
            .style("display", "none")
            .style("baseline-shift", "-100%")
            .style("font-size", "200%")
            .style('text-shadow', '0 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 -1px 0 #fff')
            .attr('x', '10')
            .attr('fill', '#333');

        var stats = annotations.append("text")
            .text("")
            .style("font-size", "150%")
            .style('text-shadow', '0 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 -1px 0 #fff')
            .attr('x', '10')
            .attr('y', height - 20)
            .attr('fill', '#333');

        var viewButtonArea = annotations.append("foreignObject")
            .style("display", "none")
            .attr("width", 100)
            .attr("height", 100);
        viewButtonArea
            .append("xhtml:div")
            .html('<button class="btn btn-primary btn-lg"><i class="glyphicon glyphicon-list-alt"></i> view</button>');
        var viewButton = viewButtonArea.selectAll('button');


        var node = svg.selectAll("circle,text");

        d3.select($svg[0])
            .on("click", function() { zoom(root); });

        zoomTo([root.x, root.y, root.r * 2 + margin]);
        updateCount(root);

        /* response to interactivity in the graph */
        var view_d = null;
        function updateCount (d) {
            stats.text(d.size + " documents (" + (100 * d.size / root.size) + "%)");
            if (d.size <= 100) {
                view_d = d;
                var box = stats.node().getBBox();
                viewButtonArea
                    .attr('x', 20 + box.width)
                    .attr('y', height - 25 - box.height)
                    .style('display', null);
            } else {
                viewButtonArea
                    .style('display', 'none');
            }
        }

        function zoom(d) {
            var focus0 = focus; focus = d;

            d3.selectAll('circle').classed('selected', false);
            if (focus.parent) {
                title
                    .style('display', 'inline')
                    .text(focus.keywords.join(", "));
                d3.selectAll('circle#circle-' + d.id).classed('selected', true);
            } else {
                title.style('display', 'none');
            }

            updateCount(d);

            var transition = d3.transition()
                .duration(d3.event.altKey ? 7500 : 750)
                .tween("zoom", function(d) {
                  var i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + margin]);
                  return function(t) { zoomTo(i(t)); };
                });

            transition.selectAll(".main text")
              .filter(function(d) { return d.parent === focus || (d == focus && (!d.children)) || this.style.display === "inline"; })
                .style("fill-opacity", function(d) { return (d.parent === focus || (d == focus && (!d.children))) ? 1 : 0; })
                .each("start", function(d) { if (d.parent === focus || (d == focus && (!d.children))) this.style.display = "inline"; })
                .each("end", function(d) { if (d.parent !== focus && !(d.parent === focus || (d == focus && (!d.children)))) this.style.display = "none"; });
        }

        function zoomTo(v) {
            var k = diameter / v[2]; view = v;
            node.attr("transform", function(d) { return "translate(" + (d.x - v[0]) * k + "," + (d.y - v[1]) * k + ")"; });
            circle.attr("r", function(d) { return d.r * k; });
        }

        /* things to do with the dialog */
        $(viewButton[0]).on('click', function(evt) {
            evt.stopPropagation();
            var dialog = $('#doc-dialog');
            dialog.modal('toggle');
            var group = dialog.find('.list-group').css('height', (height - 120) + 'px');

            var shifter = dialog.find('.panel-shifter-inner');
            if (shifter.css('position') == 'absolute') {
                // it's been animated, so un-animate it if necessary
                shifter.css('left', '0px');
            }

            group.html();
            if (view_d) {
                $.getJSON("tree_data/" + view_d.id + ".json", function(tree_data) {
                    group.html(
                        $.map(tree_data.items, function(item) { return '<a data-item-id="' + item.id + '"" href="#' + item.id + '" class="list-group-item">' + item.title + '<i class="glyphicon glyphicon-chevron-right pull-right"></i></a>' }).join("")
                    );
                });
            }
        });

        var fixed_width = null;
        var fixed_height = null;
        $('#doc-dialog .doc-list').on('click', 'a', function(evt) {
            evt.stopPropagation();
            var id = $(evt.target).attr('data-item-id');

            var outer = $('.panel-shifter-outer');
            var inner = outer.find('.panel-shifter-inner');
            var dlp = inner.find('.doc-list-panel');
            var dvp = inner.find('.doc-view-panel');

            if (!fixed_width) {
                fixed_width = dlp.width();
                fixed_height = dlp.height();
            }

            outer.css({
                'height': fixed_height + 'px',
                'width': fixed_width + 'px',
                'position': 'relative',
                'overflow': 'hidden'
            });
            inner.css({
                'position': 'absolute',
                'top': '0px',
                'left': '0px'
            });

            dlp.css({
                'position': 'absolute',
                'left': '0px',
                'height': fixed_height + 'px',
                'width': fixed_width + 'px'
            });
            dvp.css({
                'position': 'absolute',
                'left': (fixed_width + 20) + 'px',
                'display': 'block',
                'height': fixed_height + 'px',
                'width': fixed_width + 'px'
            });

            inner.animate({
                'left': '-=' + (fixed_width + 20)
            }, 'fast');

            $.getJSON("data/" + id + ".json", function(data) {

                var mtable = $('<table class="table">');
                mtable.append('<tr><td class="meta-label">Applicant</td><td>' + data.applicant + '</td></tr>');
                mtable.append('<tr><td class="meta-label">Date Received</td><td>' + formatDate(new Date(data.dateRcpt)) + '</td></tr>');
                dvp.find('.meta-container').html("").append(mtable);
                
                var body = dvp.find('.panel-body');
                body.text(data.text);
                
                var h = dvp.height() - (dvp.find('.panel-heading').height() + mtable.height() + 20);
                console.log(h, body.outerHeight(), dvp.find('.panel-heading').outerHeight(), mtable.outerHeight());
                body.css('height', h);
            })
        })
        
        $('#doc-dialog .doc-view-panel .panel-heading').on('click', 'a.back-link', function(evt) {
            evt.stopPropagation();
            var inner = $('.panel-shifter-inner');
            inner.animate({
                'left': '0'
            }, 'fast');
        })
    });

    var formatDate = function(d) {
        months = ["January", "February", "March", 
            "April", "May", "June", "July", "August", "September", 
            "October", "November", "December"];

        return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }
})(jQuery);